import * as dotenv from "dotenv";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import pinataSDK from "@pinata/sdk";
import algosdk from "algosdk";
import type { Metadata } from "./types";
import { CID } from "multiformats/cid";

dotenv.config();

const basePath = process.cwd();

const pinata = pinataSDK(
  process.env.PINATA_API_KEY as string,
  process.env.PINATA_SECRET_KEY as string
);

const algodClient = new algosdk.Algodv2(
  process.env.ALGOD_TOKEN as string,
  process.env.ALGOD_SERVER,
  process.env.ALGOD_PORT
);

export default async function mint() {
  console.log("Minting...");

  const imagePath = path.join(basePath, "src/image.png");
  const imageBuffer = fs.readFileSync(imagePath);

  let imageChecksum = "";
  let imageCID = "";
  let metadataCID = "";
  let url = "";
  let reserveAddress = "";

  // Get sha-256 checksum of image
  imageChecksum = crypto
    .createHash("sha256")
    .update(imageBuffer)
    .digest("base64");

  // Pin image to IPFS and get CID
  const readableStreamForImage = fs.createReadStream(imagePath);

  try {
    const response = await pinata.pinFileToIPFS(readableStreamForImage, {
      pinataOptions: {
        cidVersion: 1,
      },
    });

    imageCID = response.IpfsHash;
  } catch (error) {
    console.error("error pinning image to IPFS", error);
  }

  // Pin metadata JSON to IPFS and get CID
  const metadata: Metadata = {
    name: "Example ARC19",
    description: "An Example NFT minted with ARC19",
    image: "ipfs://" + imageCID,
    image_integrity: "sha256-" + imageChecksum,
    image_mimetype: "image/png",
    external_url:
      "https://github.com/algorandfoundation/ARCs/blob/main/ARCs/arc-0019.md",
    properties: {
      background: "grey",
    },
  };

  try {
    const response = await pinata.pinJSONToIPFS(metadata, {
      pinataOptions: {
        cidVersion: 1,
      },
    });

    metadataCID = response.IpfsHash;
  } catch (error) {
    console.error("error pinning metadata to IPFS", error);
  }

  // Decode the metadata CID to derive the Reserve Address and URL
  const decodedCID = CID.parse(metadataCID);

  // Derive the Reserve Address
  reserveAddress = algosdk.encodeAddress(
    Uint8Array.from(Buffer.from(decodedCID.multihash.digest))
  );

  // Derive the URL
  const getCodec = (code: number) => {
    // As per multiformats table
    // https://github.com/multiformats/multicodec/blob/master/table.csv#L9
    switch (code.toString(16)) {
      case "55":
        return "raw";
      case "70":
        return "dag-pb";
    }
  };

  const version = decodedCID.version;
  const code = decodedCID.code;
  const codec = getCodec(code);

  url = `template-ipfs://{ipfscid:${version}:${codec}:reserve:sha2-256}`;

  // Mint the NFT!
  const MNEMONIC = process.env.MNEMONIC as string;
  const { addr: ADDRESS, sk: SECRET_KEY } =
    algosdk.mnemonicToSecretKey(MNEMONIC);

  try {
    const suggestedParams = await algodClient.getTransactionParams().do();

    const transaction = algosdk.makeAssetCreateTxnWithSuggestedParamsFromObject(
      {
        from: ADDRESS,
        assetName: "Example ARC19",
        unitName: "ARC19",
        assetURL: url,
        manager: ADDRESS, // It's important to set the manager to the creator so that the NFT metadata can be updated
        reserve: reserveAddress,
        decimals: 0,
        total: 1,
        suggestedParams,
        defaultFrozen: false,
      }
    );

    const signedTransaction = transaction.signTxn(SECRET_KEY);
    const transactionId = transaction.txID().toString();

    await algodClient.sendRawTransaction(signedTransaction).do();

    const confirmedTxn = await algosdk.waitForConfirmation(
      algodClient,
      transactionId,
      4
    );

    console.log("Succesfully minted!");
    console.log("\n");
    console.log("Asset ID:", confirmedTxn["asset-index"]);
    console.log("URL:", url);
    console.log("Reserve Address:", reserveAddress);
    console.log("Metadata CID:", metadataCID);
    console.log("Image CID:", imageCID);
    console.log("\n");
    console.log(
      "View your NFT at: ",
      "https://arc3.xyz/nft/" + confirmedTxn["asset-index"]
    );
    console.log("\n");
  } catch (error) {
    console.error("error minting NFT", error);
  }
}
