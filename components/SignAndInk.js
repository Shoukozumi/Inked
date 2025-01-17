import React, { Component, useEffect,useState } from 'react';
import { v4 } from "uuid"
import WeaveHelper from "../weaveapi/helper";
import SHA256 from "crypto-js/sha256";
import { LockClosedIcon } from '@heroicons/react/20/solid'

import { Metaplex, keypairIdentity, bundlrStorage } from "@metaplex-foundation/js";
import { Connection, clusterApiUrl, Keypair } from "@solana/web3.js";

import { base58_to_binary, binary_to_base58 } from "base58-js";
const Buffer = require("buffer").Buffer;

const sideChain = "https://public.weavechain.com:443/92f30f0b6be2732cb817c19839b0940c";
//const sideChain = "http://localhost:18080/92f30f0b6be2732cb817c19839b0940c";

const authChain = "solana";
const network = "devnet"; //"testnet";

const organization = "weavedemo";
const data_collection = "inked";
const table_abstracts = "abstracts"
const table_documents = "documents"
const connection = new Connection(clusterApiUrl(network));

const SignAndInk = ({authors, title, category, abstract, keywords, nftAddress, rawfile}) => {

    let publicKey_raw = null;
    let privateKey_raw = null;
    if (false) {
        //Keys management needs to be made by the application:
        // - keys generated only once and kept in local app storage
        // - probably the user fills personal details in the app and the keys are uploaded together with that
        // - keys are authorized to have write access from the backend, after reviewing the account (or maybe automatically? however, still to be done from the backend)

        //Sample code to generate a new key
        const keys = WeaveHelper.generateKeys();
        publicKey_raw = keys[0];
        privateKey_raw = keys[1];
    } else {
        // Sample keys for testing
        publicKey_raw = "weavexUTKAe7J5faqmiq94DXXWntyRBA8bPwmrUbCtebxWd3f";
        privateKey_raw = "FpEPgjyVeYzMSb9jJtk4uhVyoNDAo8qWuoMYPKo1dXdM";
    }




    const [currentPhantomAccount, setCurrentPhantomAccount] = useState(null);
    const [publicKey, setPublicKey] = useState(publicKey_raw);
    const [privateKey, setPrivateKey] = useState(privateKey_raw);
    const [producerIndex, setProducerIndex] = useState(0);
    const [credentials, setCredentials] = useState(null);
    const [wallet, setWallet] = useState(null);
    const [success, setSuccess] = useState(false);
    const [message, setMessage] = useState(null);


  
    const getCurrentAccount = async () => {
        const response = await window.solana.connect();
        setCurrentPhantomAccount(response.publicKey.toString());
    }
    const login = async () => {
        const pub = publicKey;
        const pvk = privateKey;

        const nodeApi = new WeaveHelper.WeaveAPI().create(WeaveHelper.getConfig(sideChain, pub, pvk));
        await nodeApi.init();
        console.log(nodeApi)
        const pong = await nodeApi.ping();
        console.log(pong)

        const session = await nodeApi.login(organization, pub, data_collection, credentials);
        console.log(session)
        console.log(session.scopes.length > 0)
        return { nodeApi, session };
    }

    const connect = async () => {
        const pub = publicKey;
        const pvk = privateKey;
        
        
        setCurrentPhantomAccount(await getCurrentAccount());
        //This message must match what's hashed on server side, changing it here should trigger changing it also in the node
        let msg = "Please sign this message to confirm you own this wallet\nThere will be no blockchain transaction or any gas fees." +
            "\n\nWallet: " + currentPhantomAccount +
            "\nKey: " + pub;

        const signature = await window.solana.signMessage(new TextEncoder().encode(msg), 'utf8');
        const sig = binary_to_base58(signature.signature);
        console.log(sig)

        const credentials = {
            "account": authChain + ":" + currentPhantomAccount,
            "sig": sig,
            "template": "*",
            "role": "*"
        }

        
        setPublicKey(pub);
        setPrivateKey(pvk);
        setCredentials(credentials);

    }

    const write = async () => {
        

        //1. login. The login could be done only once if the nodeApi and session variables are kept in the component state
        const { nodeApi, session } = await login();

        //const did = "did:inked:" + v4().replace("-", "");
        const did = "did:inked:1234567890abcdef";
        const location = sideChain

        //2. write public info
        {
            const items = [
                [
                    null, //_id, filled server side
                    null, // timestamp
                    null, // writer
                    null, // signature of writer
                    did,
                    authors,
                    title,
                    category,
                    abstract,
                    keywords,
                    nftAddress,
                    location
                ]
            ];
            const records = new WeaveHelper.Records(table_abstracts, items);
            const resWrite = await nodeApi.write(session, data_collection, records, WeaveHelper.Options.WRITE_DEFAULT)
            //console.log(resWrite)
        }
            console.log("Done writing public info")
        //3. write private info
        {
            try {
                // const toBase64 = file => new Promise((resolve, reject) => {
                //     const reader = new FileReader();
                //     reader.readAsDataURL(file);
                //     reader.onload = () => resolve(reader.result);
                //     reader.onerror = error => reject(error);
                // });
                console.log("Uploading file")
                // print(rawfile.type)
                // print(rawfile)

                
                const encoded = "data:application/pdf;base64,"
                const content = rawfile.substr("data:application/pdf;base64,".length);
                const checksum = SHA256(Buffer(content, "base64")).toString(); //result is hex, eventually transform to base58
                console.log(checksum)

                if (false) {
                    const wallet = Keypair.generate(); //TODO: use phantom
                    const metaplex = Metaplex.make(connection)
                        .use(keypairIdentity(wallet))
                        .use(bundlrStorage({
                            address: 'https://' + network + '.bundlr.network',
                            providerUrl: 'https://api.' + network + '.solana.com',
                            timeout: 60000
                        }));
                    console.log(metaplex);

                    const { uri } = await metaplex
                        .nfts()
                        .uploadMetadata({
                            name: did,
                            description: checksum,
                            image: "https://placekitten.com/200/300" //TODO: replace with Inked NFT image
                        });
                    console.log(uri)

                    const { nft } = await metaplex
                        .nfts()
                        .create({
                            uri: uri,
                            name: did,
                            sellerFeeBasisPoints: 500
                        });
                    console.log(nft);
                }

                //TODO: create new NFT to control the access to the document
                const nft_address = "12345"; //TODO
                console.log("NFT" )
                const access = "nft:solana:" + nft_address;
                const items = [
                    [
                        null, //_id, filled server side
                        null, // timestamp
                        null, // writer
                        null, // signature of writer
                        did,
                        access,
                        content
                    ]
                ];
                const records = new WeaveHelper.Records(table_documents, items);
                console.log("Writing private info")
                const resWrite = await nodeApi.write(session, data_collection, records, WeaveHelper.Options.WRITE_DEFAULT)
                console.log("resWrite"+resWrite)

                setSuccess(true);
                setMessage("Document published");
            } catch (e) {
                console.log(e);
                console("erroe")
                setSuccess(false);
                setMessage("Failed publishing document");
            }
        }
        console.log("Done writing private info")
        console.log(success)
        console.log(message)
        console.log(authors)
        console.log(nftAddress)
    }
    const handleButtonClick = async (e) => {
        e.preventDefault();
        console.log("Sign and Ink")
        write()
    }
    return (
        <>
            <button
                type="submit"
                className="group relative flex w-1/2 justify-around rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                onClick={handleButtonClick}
                ref={null}
            >
                <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                    <LockClosedIcon className="h-5 w-5 text-indigo-500 group-hover:text-indigo-400" aria-hidden="true" />
                </span>
                <span>Sign and Ink</span>
            </button>
        </>
    )
}



export default SignAndInk