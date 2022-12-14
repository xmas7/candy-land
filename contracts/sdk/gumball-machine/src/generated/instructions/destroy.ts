/**
 * This code was GENERATED using the solita package.
 * Please DO NOT EDIT THIS FILE, instead rerun solita to update it or write a wrapper to add functionality.
 *
 * See: https://github.com/metaplex-foundation/solita
 */

import * as beet from '@metaplex-foundation/beet'
import * as web3 from '@solana/web3.js'

/**
 * @category Instructions
 * @category Destroy
 * @category generated
 */
export const destroyStruct = new beet.BeetArgsStruct<{
  instructionDiscriminator: number[] /* size: 8 */
}>(
  [['instructionDiscriminator', beet.uniformFixedSizeArray(beet.u8, 8)]],
  'DestroyInstructionArgs'
)
/**
 * Accounts required by the _destroy_ instruction
 *
 * @property [_writable_] gumballMachine
 * @property [_writable_, **signer**] authority
 * @category Instructions
 * @category Destroy
 * @category generated
 */
export type DestroyInstructionAccounts = {
  gumballMachine: web3.PublicKey
  authority: web3.PublicKey
}

export const destroyInstructionDiscriminator = [
  157, 40, 96, 3, 135, 203, 143, 74,
]

/**
 * Creates a _Destroy_ instruction.
 *
 * @param accounts that will be accessed while the instruction is processed
 * @category Instructions
 * @category Destroy
 * @category generated
 */
export function createDestroyInstruction(accounts: DestroyInstructionAccounts) {
  const { gumballMachine, authority } = accounts

  const [data] = destroyStruct.serialize({
    instructionDiscriminator: destroyInstructionDiscriminator,
  })
  const keys: web3.AccountMeta[] = [
    {
      pubkey: gumballMachine,
      isWritable: true,
      isSigner: false,
    },
    {
      pubkey: authority,
      isWritable: true,
      isSigner: true,
    },
  ]

  const ix = new web3.TransactionInstruction({
    programId: new web3.PublicKey(
      'BRKyVDRGT7SPBtMhjHN4PVSPVYoc3Wa3QTyuRVM4iZkt'
    ),
    keys,
    data,
  })
  return ix
}
