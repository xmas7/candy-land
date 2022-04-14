import * as anchor from "@project-serum/anchor";
import { Gummyroll } from "../target/types/gummyroll";
import { Program, Provider, } from "@project-serum/anchor";
import {
  Connection as web3Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { assert } from "chai";

import { buildTree, getProofOfLeaf, updateTree, Tree } from "./merkle-tree";
import { decodeMerkleRoll, getMerkleRollAccountSize } from "./merkle-roll-serde";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";

// @ts-ignore
let Gummyroll;

export function chunk<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_: any, i: number) =>
    arr.slice(i * size, i * size + size)
  );
}

describe("gummyroll-continuous", () => {
  let connection: web3Connection;
  let wallet: NodeWallet;
  let offChainTree: ReturnType<typeof buildTree>;
  let merkleRollKeypair: Keypair;
  let payer: Keypair;

  console.log(connection);
  const MAX_SIZE = 1024;
  const MAX_DEPTH = 20;
  // This is hardware dependent... if too large, then majority of tx's will fail to confirm
  const BATCH_SIZE = 12;

  async function createEmptyTreeOnChain(
    payer: Keypair
  ): Promise<Keypair> {
    const merkleRollKeypair = Keypair.generate();
    const requiredSpace = getMerkleRollAccountSize(MAX_DEPTH, MAX_SIZE);
    const allocAccountIx = SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: merkleRollKeypair.publicKey,
      lamports:
        await Gummyroll.provider.connection.getMinimumBalanceForRentExemption(
          requiredSpace
        ),
      space: requiredSpace,
      programId: Gummyroll.programId,
    });

    const initGummyrollIx = Gummyroll.instruction.initEmptyGummyroll(
      MAX_DEPTH,
      MAX_SIZE,
      {
        accounts: {
          merkleRoll: merkleRollKeypair.publicKey,
          authority: payer.publicKey,
        },
        signers: [payer],
      }
    );

    const tx = new Transaction().add(allocAccountIx).add(initGummyrollIx);
    let txid = await Gummyroll.provider.send(tx, [payer, merkleRollKeypair], {
      commitment: "confirmed",
    });
    return merkleRollKeypair
  }

  function createEmptyTreeOffChain(): Tree {
    const leaves = Array(2 ** MAX_DEPTH).fill(Buffer.alloc(32));
    let tree = buildTree(leaves);
    return tree;
  }

  beforeEach(async () => {
    payer = Keypair.generate();
    connection = new web3Connection(
      "http://localhost:8899",
      {
        commitment: 'confirmed'
      }
    );
    wallet = new NodeWallet(payer)
    anchor.setProvider(new Provider(connection, wallet, { commitment: connection.commitment, skipPreflight: true }));
    Gummyroll = anchor.workspace.Gummyroll as Program<Gummyroll>;
    await Gummyroll.provider.connection.confirmTransaction(
      await Gummyroll.provider.connection.requestAirdrop(payer.publicKey, 1e10),
      "confirmed"
    );

    merkleRollKeypair = await createEmptyTreeOnChain(payer);

    console.log("TREE ID: ", merkleRollKeypair.publicKey.toString())

    const merkleRoll = await Gummyroll.provider.connection.getAccountInfo(
      merkleRollKeypair.publicKey
    );

    let onChainMerkle = decodeMerkleRoll(merkleRoll.data);

    // Check header bytes are set correctly
    assert(onChainMerkle.header.maxDepth === MAX_DEPTH, `Max depth does not match ${onChainMerkle.header.maxDepth}, expected ${MAX_DEPTH}`);
    assert(onChainMerkle.header.maxBufferSize === MAX_SIZE, `Max buffer size does not match ${onChainMerkle.header.maxBufferSize}, expected ${MAX_SIZE}`);

    assert(
      onChainMerkle.header.authority.equals(payer.publicKey),
      "Failed to write auth pubkey"
    );

    offChainTree = createEmptyTreeOffChain();

    assert(
      onChainMerkle.roll.changeLogs[0].root.equals(new PublicKey(offChainTree.root)),
      "On chain root does not match root passed in instruction"
    );
  });

  // Will be used in future test
  function createReplaceIx(tree: Tree, merkleRollKeypair: Keypair, payer: Keypair, i: number) {
    /// Empty nodes are special, so we have to create non-zero leaf for index 0
    let newLeaf = Buffer.alloc(32, Buffer.from(Uint8Array.from([1 + i])));
    let nodeProof = getProofOfLeaf(tree, i).map((node) => { return { pubkey: new PublicKey(node.node), isSigner: false, isWritable: false } });
    const replaceLeafIx = Gummyroll.instruction.replaceLeaf(
      { inner: Array.from(tree.root) },
      { inner: Array.from(tree.leaves[i].node) },
      { inner: Array.from(newLeaf) },
      i,
      {
        accounts: {
          merkleRoll: merkleRollKeypair.publicKey,
          authority: payer.publicKey,
        },
        signers: [payer],
        remainingAccounts: nodeProof,
      }
    );
    return replaceLeafIx;
  }

  function createInsertOrAppendIx(tree: Tree, merkleRollKeypair: Keypair, payer: Keypair, i: number) {
    /// Empty nodes are special, so we have to create non-zero leaf for index 0
    let newLeaf = Buffer.alloc(32, Buffer.from(Uint8Array.from([1 + i])));
    let nodeProof = getProofOfLeaf(tree, i).map((node) => { return { pubkey: new PublicKey(node.node), isSigner: false, isWritable: false } });
    return Gummyroll.instruction.insertOrAppend(
      { inner: Array.from(tree.root) },
      { inner: Array.from(newLeaf) },
      i,
      {
        accounts: {
          merkleRoll: merkleRollKeypair.publicKey,
          authority: payer.publicKey,
        },
        signers: [payer],
        remainingAccounts: nodeProof,
      }
    );
  }

  function createAppend(merkleRollKeypair: Keypair, payer: Keypair, i: number) {
    let newLeaf = Buffer.alloc(32, Buffer.from(Uint8Array.from([1 + i])));
    return Gummyroll.instruction.append(
      { inner: Array.from(newLeaf) },
      {
        accounts: {
          merkleRoll: merkleRollKeypair.publicKey,
          authority: payer.publicKey,
        },
        signers: [payer],
      }
    );
  }

  it(`${MAX_SIZE} transactions in batches of ${BATCH_SIZE}`, async () => {
    return;
    let indicesToSend = [];
    for (let i = 0; i < MAX_SIZE; i++) {
      indicesToSend.push(i);
    };
    const indicesToSync = indicesToSend;

    while (indicesToSend.length > 0) {
      let batchesToSend = chunk<number>(indicesToSend, BATCH_SIZE);
      let indicesLeft: number[] = [];

      for (const batch of batchesToSend) {
        const txIds = [];
        const txIdToIndex: Record<string, number> = {};
        for (const i of batch) {
          const tx = new Transaction().add(createReplaceIx(offChainTree, merkleRollKeypair, payer, i));

          tx.feePayer = payer.publicKey;
          tx.recentBlockhash = (
            await connection.getLatestBlockhash('singleGossip')
          ).blockhash;

          await wallet.signTransaction(tx);
          const rawTx = tx.serialize();

          txIds.push(
            connection.sendRawTransaction(rawTx, { skipPreflight: true })
              .then((txId) => {
                txIdToIndex[txId] = i;
                return txId
              })
              .catch((reason) => {
                console.error(reason);
                return i
              })
          );
        }
        const sendResults: (string | number)[] = (await Promise.all(txIds));
        const batchToConfirm = sendResults.filter((result) => typeof result === "string") as string[];
        const txsToReplay = sendResults.filter((err) => typeof err === "number") as number[];
        if (txsToReplay.length) {
          indicesLeft = indicesLeft.concat(txsToReplay as number[]);
          console.log(`${txsToReplay.length} tx's failed in batch`)
        }

        await Promise.all(batchToConfirm.map(async (txId) => {
          const confirmation = await connection.confirmTransaction(txId, "confirmed")
          if (confirmation.value.err && txIdToIndex[txId]) {
            txsToReplay.push(txIdToIndex[txId]);
          }
          return confirmation;
        }));

        indicesLeft = indicesLeft.concat(txsToReplay);
      }

      indicesToSend = indicesLeft;
    }

    // Sync off-chain tree
    for (const i of indicesToSync) {
      updateTree(offChainTree, Buffer.alloc(32, Buffer.from(Uint8Array.from([1 + i]))), i);
    }

    const merkleRoll = await Gummyroll.provider.connection.getAccountInfo(
      merkleRollKeypair.publicKey
    );
    let onChainMerkle = decodeMerkleRoll(merkleRoll.data);

    const onChainRoot = onChainMerkle.roll.changeLogs[onChainMerkle.roll.activeIndex].root;
    const treeRoot = new PublicKey(offChainTree.root);
    assert(
      onChainRoot.equals(treeRoot),
      "On chain root does not match root passed in instruction"
    );
  });
});
