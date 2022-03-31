import { ImageList, ImageListItem } from "@mui/material";
import InferNextPropsType from "infer-next-props-type";
import type { NextPage, NextPageContext } from "next";
import { useRouter } from "next/router";
import OwnerItem from "../../../components/OwnerItem";
import getItemsForOwner from "../../../lib/loaders/getItemsForOwner";

const OwnerItemsList: NextPage<
  InferNextPropsType<typeof getServerSideProps>
> = ({ items }) => {
  const router = useRouter();
  if (items.length === 0) {
    return <h1>No items</h1>;
  }
  return (
    <>
      <h1>{router.query.ownerPubkey}&apos;s items</h1>
      <ImageList cols={4} gap={16}>
        {items.map((item) => (
          <ImageListItem key={`${item.treeId}:${item.index}`}>
            <OwnerItem {...item} />
          </ImageListItem>
        ))}
      </ImageList>
    </>
  );
};

export async function getServerSideProps({ query }: NextPageContext) {
  const ownerPubkey = query.ownerPubkey as NonNullable<
    typeof query.ownerPubkey
  >[number];
  const items = await getItemsForOwner(ownerPubkey);
  if (!items) {
    return { notFound: true };
  }
  return {
    props: { items },
  };
}

export default OwnerItemsList;
