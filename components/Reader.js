import React, { Component, useEffect } from 'react';
import './App.css';
import WeaveHelper from "./weaveapi/helper";
import { binary_to_base58, base58_to_binary } from 'base58-js'
import SHA256 from "crypto-js/sha256";
const solanaWeb3 = require("@solana/web3.js");
const Buffer = require("buffer").Buffer

const sideChain = "https://public.weavechain.com:443/92f30f0b6be2732cb817c19839b0940c";
//const sideChain = "http://localhost:18080/92f30f0b6be2732cb817c19839b0940c";

const authChain = "solana";
const network = "testnet";

const organization = "weavedemo";
const data_collection = "inked";
const table  = "documents"

const storageAccount = "EiG3thMCVKXKMAKD2ryQvRqx3pEb2ZxjBdRkDQ7At2na"; //The program storage account that keeps the hashes association

const { ethereum } = window;

class Reader extends Component {
    constructor(props) {
        super(props);

        let publicKey = null;
        let privateKey = null;
        if (false) {
            //Keys management needs to be made by the application:
            // - keys generated only once and kept in local app storage
            // - probably the user fills personal details in the app and the keys are uploaded together with that
            // - keys are authorized to have write access from the backend, after reviewing the account (or maybe automatically? however, still to be done from the backend)

            //Sample code to generate a new key
            const keys = WeaveHelper.generateKeys();
            publicKey = keys[0];
            privateKey = keys[1];
        } else {
            publicKey = "weaveo6J6ujMckcJRcLqB4jY2WvJXmNnzWeSBkANXB8d5fRmx";
            privateKey = "6JneXkrQvQYRpUA4rBXqs7aVQWTMxQzSJgodoMmyp55Z";
        }

        this.state = {
            currentPhantomAccount: null,
            publicKey: publicKey,
            privateKey: privateKey,
            credentials: null,
            did: "did:inked:123456789abcdef",
            success: false,
            message: null,
            error: null
        };
    }

    async getCurrentAccount() {
        const response = await window.solana.connect();
        this.setState({ currentPhantomAccount: response.publicKey.toString() });
    }

    async connect() {
        this.setState({ currentPhantomAccount: await this.getCurrentAccount() });

        //a new key is generated every time, so there is no key management needed for the consumer (which does not need to know about weavechain)
        // rights will be inherited based on the wallet ownership proof and NFT ownership (could also be payments on chain)
        const keys = WeaveHelper.generateKeys();
        const pub = keys[0];
        const pvk = keys[1];

        //This message must match what's hashed on server side, changing it here should trigger changing it also in the node
        let msg = "Please sign this message to confirm you own this wallet\nThere will be no blockchain transaction or any gas fees." +
            "\n\nWallet: " + this.state.currentPhantomAccount +
            "\nKey: " + pub;

        const sig = await ethereum.request({
            method: 'personal_sign',
            params: [this.state.currentPhantomAccount, msg]
        });

        const credentials = {
            "account": authChain + ":" + this.state.currentPhantomAccount,
            "sig": sig,
            "template": "*",
            "role": "*"
        }

        this.setState({
            publicKey: pub,
            privateKey: pvk,
            credentials: credentials
        });
    }


    async login() {
        const pub = this.state.publicKey;
        const pvk = this.state.privateKey;

        const nodeApi = new WeaveHelper.WeaveAPI().create(WeaveHelper.getConfig(sideChain, pub, pvk));
        await nodeApi.init();
        console.log(nodeApi)
        const pong = await nodeApi.ping();
        console.log(pong)

        const session = await nodeApi.login(organization, pub, data_collection, this.state.credentials);
        console.log(session)
        console.log(session.scopes.length > 0)

        return { nodeApi, session };
    }

    async download() {
        const {
            did
        } = this.state;

        //1. login. The login could be done only once if the nodeApi and session variables are kept in the component state
        const { nodeApi, session } = await this.login();

        //2. read the private document
        const filter = new WeaveHelper.Filter(WeaveHelper.FilterOp.eq("did", did), null, null, [ "pubkey", "did" ]);
        const resRead = await nodeApi.read(session, data_collection, table, filter, WeaveHelper.Options.READ_DEFAULT_NO_CHAIN)

        try {
            const encoded = resRead?.data ? resRead.data[0]["document"] : null;
            if (encoded) {
                const access = resRead.data[0]["access"];
                const contract = access.split(":")[2];
                console.log(contract);

                //3. get the hash from the solana NFT (or some contract)
                let connection = new solanaWeb3.Connection(solanaWeb3.clusterApiUrl(network), "confirmed");
                const programAccount = new solanaWeb3.PublicKey(storageAccount);
                const accountInfo = await connection.getAccountInfo(programAccount, "confirmed");
                const contractData = accountInfo.data;
                console.log(contractData)

                const data = new Blob([ Buffer.from(encoded, "base64") ], { type: "application/pdf" });
                const checksum = SHA256(data).toString();
                console.log(checksum);

                //TODO: check hash
                const hashMatch = true;

                if (hashMatch) {
                    //4. trigger download
                    const fileName = did + ".pdf";

                    var url = URL.createObjectURL(data);
                    var hlink = document.createElement("a");
                    hlink.href = url;
                    hlink.download = fileName;
                    hlink.click();

                    this.setState({
                        success: true,
                        message: "Download successful"
                    })
                } else {
                    this.setState({
                        success: false,
                        message: "Document hash not matching on-chain value"
                    })
                }
            } else {
                this.setState({
                    success: false,
                    message: "Not authorized or document does not exist"
                })
            }
        } catch (e) {
            console.log(e);
            this.setState({
                success: false,
                message: "Error retrieving document"
            })
        }
    }

    render() {
        const {
            did,
            success,
            message
        } = this.state;

        return <section className="bg-teal-50 min-h-screen">
            <header className="items-center justify-between pt-12">
                <h1 className="mx-auto text-center pb-2 text-5xl font-extrabold font-mono text-gray-800">
                    Access a document
                </h1>
                <h1 className="mx-auto text-center m-2 text-2xl font-medium font-mono text-gray-800 underline decoration-indigo-500 ">Reader View</h1>
            </header>

            <div className="text-sm items-center text-center mt-6">
                <div className="max-w-2xl p-6 mx-auto text-center backdrop-sepia-0 backdrop-blur-sm border shadow-xl border-blue-500/10">

                    <p className="transition ">
                        <span className="text-blue-700">Connected Phantom wallet: </span> <span className="text-gray-800"> {this.state.currentPhantomAccount}</span>
                        <br />
                        <br />
                        <span className="text-blue-700">Weavechain public key: </span> <span className="text-gray-800">{this.state.publicKey}</span>
                        <br />
                        <br />

                        <label>DID</label>
                        &nbsp;
                        <input className='border shadow-xl border-blue-500/10 text-center' style={{width: "600px"}}
                               type="text"
                               placeholder="0"
                               value={did}
                               onChange={(event) => this.setState({ did: event.target.value })}
                        />
                        <br />
                        <br />

                        {message ? <>
                            <span style={{color: success ? "green" : "red", whiteSpace: "pre-line"}}>{message}</span>
                        </> : null}
                        <br />
                        <br />

                        <button className="px-5 py-2.5 mt-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-md shadow" type="submit" onClick={() => this.connect()}>Connect Wallet</button>
                        &nbsp;
                        <button className="px-5 py-2.5 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-md shadow" type="submit" onClick={() => this.download()}>Download</button>
                    </p>
                </div>
            </div>


        </section>
    }
}

export default Reader;
