import {
    AnchorProvider,
    Program,
    web3
} from "@coral-xyz/anchor";

import type {EasyDao} from "../../target/types/easy_dao";
import idl from "../../target/idl/easy_dao.json";



export const PROGRAM_ID: web3.PublicKey = new web3.PublicKey("6D4BY2xMmPu54faKU9mbpNXkfwmqAgE6C5HrqNUEtXEM");
export const NETWORK    = "http://127.0.0.1:8899"; // devnet / localnet
export const COMMITMENT = "confirmed";

// ——连接 provider——
export const getProvider = (wallet: any) => {
    const connection = new web3.Connection(NETWORK, COMMITMENT);
    return new AnchorProvider(connection, wallet, { preflightCommitment: COMMITMENT });
};

// ——实例化 Program——
export const getProgram = (wallet: any) => {
    const provider = getProvider(wallet);
    return new Program<EasyDao>(
        idl as any,
        provider as AnchorProvider
    );
};

// --- 社区账户 PDA（固定地址）---
// 需要根据自己社区账户地址进行变更
export const REALM_PDA = new web3.PublicKey(
    "C7PSRJ5RNhd6kq8M7QsnZ7f6UmA7AqNAbEetNYjiYVzE"
);

export const REALM_MINT = new web3.PublicKey(
    "3Wku9XAZhR2jx3PzG8cunGXxdkMHTzPfhaFxaaedoEBB"
);

// --- 社区目标账户 PDA（固定地址）---
export const GOVERNANCE_PDA = web3.PublicKey.findProgramAddressSync(
    [REALM_PDA.toBuffer(), Buffer.from("governance")],
    PROGRAM_ID
)[0];
