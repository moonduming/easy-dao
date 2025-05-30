import fs from "fs";
import path from "path";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { EasyDao } from "../target/types/easy_dao";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { createMint } from "@solana/spl-token";

describe("easy-dao", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.easyDao as Program<EasyDao>;
  
  const connection = provider.connection;

  const payer = provider.wallet.publicKey;

  let realmConfigPda: PublicKey;
  let realmPda: PublicKey;
  let mint: PublicKey;
  let communityTokenPda: PublicKey;

  const id = new anchor.BN(1);

  const CACHE_PATH = path.resolve(__dirname, "addresses.json");

  const USER_KEYPAIR_PATH = path.resolve(__dirname, "user_secret.json");

  function saveUser(kp: Keypair) {
    fs.writeFileSync(
      USER_KEYPAIR_PATH,
      JSON.stringify(Array.from(kp.secretKey))
    );
  }

  function loadUser(): Keypair {
    if (!fs.existsSync(USER_KEYPAIR_PATH)) {
      throw new Error("❌ 用户密钥文件 user_secret.json 不存在，请先运行 createEnvironment 初始化！");
    }
    const arr = Uint8Array.from(
      JSON.parse(fs.readFileSync(USER_KEYPAIR_PATH, "utf8"))
    );
    return Keypair.fromSecretKey(arr);
  }

  interface AddrCache {
    realmConfigPda: string;
    realmPda: string;
    mint: string;
    communityTokenPda: string;
  }

  function saveCache(obj: AddrCache) {
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(obj, null, 2), "utf8");
  }

  function loadCache(): AddrCache | null {
    if (!fs.existsSync(CACHE_PATH)) return null;
    return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
  }

  async function createEnvironment() {
    const user = Keypair.generate();
    // derive PDAs
    [realmConfigPda] = PublicKey.findProgramAddressSync(
      [
        id.toArrayLike(Buffer, "le", 8),
        Buffer.from("realm_config")
      ],
      program.programId
    );

    [realmPda] = PublicKey.findProgramAddressSync(
      [
        id.toArrayLike(Buffer, "le", 8),
        Buffer.from("realm")
      ],
      program.programId
    );

    // 给 user sol
    const airdropSig = await connection.requestAirdrop(user.publicKey, 2 * LAMPORTS_PER_SOL);
    const bh = await connection.getLatestBlockhash("confirmed");
    await connection.confirmTransaction(
      {signature: airdropSig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight},
      "confirmed"
    );

    // 创建 mint
    mint = await createMint(connection, user, user.publicKey, null, 6);

    [communityTokenPda] = PublicKey.findProgramAddressSync(
      [
        id.toArrayLike(Buffer, "le", 8),
        mint.toBuffer(),
        realmPda.toBuffer(),
        Buffer.from("community_token")
      ],
      program.programId
    );

    saveUser(user);

    saveCache({
      realmConfigPda: realmConfigPda.toBase58(),
      realmPda: realmPda.toBase58(),
      mint: mint.toBase58(),
      communityTokenPda: communityTokenPda.toBase58()
    })
  }

  before(async () => {
    const cached = loadCache();
    if (cached) {
      // assign cached pubkeys
      realmConfigPda    = new PublicKey(cached.realmConfigPda);
      realmPda  = new PublicKey(cached.realmPda);
      mint  = new PublicKey(cached.mint);
      communityTokenPda   = new PublicKey(cached.communityTokenPda);
    } else {
      await createEnvironment();
    }
  })

  it("Is initialized!", async () => {
    // (1) RealmConfig —— 只用社区代币，reserved 占位 0 即可
    const realmConfig = {
      reserved: [0, 0, 0, 0, 0, 0],                      // u8[6]
      minCommunityWeightToCreateGovernance: new anchor.BN(1), // 至少 1 枚代币就能提案
      communityMintMaxVoterWeightSource: {                   // 不做上限限制
        absolute: new anchor.BN(0),                          // 0 = “无限制”
      },
    } as any;

    // (2) GoverningTokenConfig —— 不用插件、固定 5 个空位的锁权限人
    const governingTokenConfig = {
      voterWeightAddin: null,     // 不用加权插件
      maxVoterWeightAddin: null,  // 不用最大权插件
      tokenType: { liquid: {} },  // 流动型代币
      reserved: [0, 0, 0, 0],     // u8[4]
      lockAuthorities: []         // 默认为 0,
    } as any;

    const tx = await program.methods.createRealm(
      id,
      "测试",
      realmConfig,
      governingTokenConfig
    ).accounts({
      authority: payer,
      mint: mint,
      tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID
    }).rpc();

    console.log("initialized success", tx);

    // === 校验链上 Realm 账户 ===
    const realmAccount = await program.account.realm.fetch(realmPda);
    // 校验名称
    if (realmAccount.name !== "测试") {
      throw new Error(`❌ Realm 名称不匹配,expected: 测试, got: ${realmAccount.name}`);
    }
    // 校验社区 Mint
    if (!realmAccount.communityMint.equals(mint)) {
      throw new Error(`❌ communityMint 不匹配,expected: ${mint.toBase58()}, got: ${realmAccount.communityMint.toBase58()}`);
    }

    // 校验社区 金库账户
    if (!realmAccount.communityTokenAccount.equals(communityTokenPda)) {
      throw new Error(`❌ communityTokenAccount 不匹配,expected: ${mint.toBase58()}, got: ${realmAccount.communityMint.toBase58()}`);
    }

    // 校验最小治理权
    if (!realmAccount.config.minCommunityWeightToCreateGovernance.eq(new anchor.BN(1))) {
      throw new Error("❌ minCommunityWeightToCreateGovernance 应为 1");
    }

    // 校验账户类型
    if (!("realm" in realmAccount.accountType)) {
      throw new Error("❌ realmAccount.accountType 应为 Realm");
    }

    console.log("✅ Realm 账户链上校验通过！");

    // === 校验链上 RealmConfig 账户 ===
    const realmConfigOnChain = await program.account.realmConfigAccount.fetch(realmConfigPda);

    // 检查 RealmConfig 里的 realm 字段
    if (!realmConfigOnChain.realm.equals(realmPda)) {
      throw new Error("❌ RealmConfig.realm 不匹配");
    }

    // 检查 tokenType 是否为 liquid
    if (!("liquid" in realmConfigOnChain.communityTokenConfig.tokenType)) {
      throw new Error("❌ communityTokenConfig.tokenType 应为 liquid");
    }

    // 检查账户类型
    if (!("realmConfig" in realmConfigOnChain.accountType)) {
      throw new Error("❌ communityTokenConfig.accountType 应为 RealmConfig");
    }

    console.log("✅ RealmConfig 账户链上校验通过！");

  });
});
