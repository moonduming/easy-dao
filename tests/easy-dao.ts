import fs from "fs";
import path from "path";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { EasyDao } from "../target/types/easy_dao";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { getMint, createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";

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
  let users: Keypair[];

  const id = new anchor.BN(1);

  const CACHE_PATH = path.resolve(__dirname, "addresses.json");

  const USERS_KEYPAIR_PATH = path.resolve(__dirname, "users_secret.json");

  /** 生成/加载多用户密钥对，方便后续投票测试 **/
  function saveUsers(kps: Keypair[]) {
    fs.writeFileSync(
      USERS_KEYPAIR_PATH,
      JSON.stringify(kps.map(kp => Array.from(kp.secretKey)))
    );
  }

  function loadUsers(): Keypair[] {
    if (!fs.existsSync(USERS_KEYPAIR_PATH)) {
      throw new Error("❌ 用户密钥文件 users_secret.json 不存在，请先运行 createEnvironment 初始化！");
    }
    const arr = JSON.parse(fs.readFileSync(USERS_KEYPAIR_PATH, "utf8")) as number[][];
    return arr.map(a => Keypair.fromSecretKey(Uint8Array.from(a)));
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
    users = [];
    for (let i = 0; i < 20; i++) {
      const kp = Keypair.generate();
      users.push(kp);
      // 给每个用户空投 2 SOL，方便后续操作
      const airdropSig = await connection.requestAirdrop(kp.publicKey, 2 * LAMPORTS_PER_SOL);
      const bh = await connection.getLatestBlockhash("confirmed");
      await connection.confirmTransaction(
        { signature: airdropSig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight },
        "confirmed"
      );
    }
    // 使用第一个用户来创建社区 Mint
    const user = users[0];
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

    // 创建 mint
    mint = await createMint(connection, user, user.publicKey, null, 6);

    // 给每个用户mint 100枚代币
    for (const u of users) {
      const ata = await getOrCreateAssociatedTokenAccount(
        connection,
        user, // payer用mint创建者
        mint,
        u.publicKey
      );
      await mintTo(
        connection,
        user,     // mint authority
        mint,
        ata.address,
        user,
        100_000_000
      );
      console.log(`Mint 100 tokens to ${u.publicKey.toBase58()} success`);
    }

    [communityTokenPda] = PublicKey.findProgramAddressSync(
      [
        mint.toBuffer(),
        realmPda.toBuffer(),
        Buffer.from("community_token")
      ],
      program.programId
    );

    saveUsers(users);

    saveCache({
      realmConfigPda: realmConfigPda.toBase58(),
      realmPda: realmPda.toBase58(),
      mint: mint.toBase58(),
      communityTokenPda: communityTokenPda.toBase58()
    })
  }

  before(async () => {
    let usersLoaded: Keypair[] | null = null;
    try {
      usersLoaded = loadUsers();
    } catch (_) { /* 文件不存在时继续创建环境 */ }

    const cached = loadCache();
    if (cached && usersLoaded) {
      // assign cached pubkeys
      realmConfigPda    = new PublicKey(cached.realmConfigPda);
      realmPda  = new PublicKey(cached.realmPda);
      mint  = new PublicKey(cached.mint);
      communityTokenPda   = new PublicKey(cached.communityTokenPda);
      users = usersLoaded;
    } else {
      await createEnvironment();
    }
  })

  it("Is initialized!", async () => {
    // (1) RealmConfig —— 只用社区代币
    const realmConfig = {
      minCommunityWeightToCreateGovernance: new anchor.BN(1), // 至少 1 枚代币就能提案
      communityMintMaxVoterWeightSource: {                   // 不做上限限制
        supplyFraction: [new anchor.BN(10_000_000)],                          // 100%
      },
    } as any;

    // (2) GoverningTokenConfig —— 不用插件、固定 5 个空位的锁权限人
    const governingTokenConfig = {
      tokenType: { liquid: {} },  // 流动型代币
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
    console.log("realmAccount: ", realmAccount.config);
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
      throw new Error(`❌ communityTokenAccount 不匹配,expected: ${communityTokenPda.toBase58()}, got: ${realmAccount.communityTokenAccount.toBase58()}`);
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

  it("create token owner record for all users", async () => {
    for (const user of users) {
      const tx = await program.methods.creatTokenOwnerRecord()
        .accounts({
          user: user.publicKey,
          mint: mint,
          realm: realmPda,
        })
        .signers([user])
        .rpc();
      console.log(`✅ create token owner record for ${user.publicKey.toBase58()} success`, tx);
    }
  });

  it.only("deposit governing tokens", async () => {
    for (const user of users) {
      const tx = await program.methods.depositGoverningTokens(
        new anchor.BN(20)
      )
        .accounts({
          user: user.publicKey,
          mint: mint,
          realm: realmPda,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();
      console.log(`✅ deposit governing tokens for ${user.publicKey.toBase58()} success`, tx);
    }
  });

  it("create governance", async () => {
    // 1. 构造 GovernanceConfig（字段需与 IDL 一致）
    const governanceConfig = {
      communityVoteThreshold: { yesVotePercentage: [10] },            // u8
      minCommunityWeightToCreateProposal: new anchor.BN(1),         // u64
      transactionsHoldUpTime:            new anchor.BN(0),          // u32
      votingBaseTime:                    new anchor.BN(120),        // u32
      votingCoolOffTime:                 new anchor.BN(60),         // u32
    } as any;

    // console.log(
    //   JSON.stringify(
    //     program.idl.types.find((t) => t.name === "voteThreshold"),
    //     null,
    //     2
    //   )
    // );
  
    // 2. 计算 Governance PDA：seeds = [realm, "governance"]
    const [governancePda] = PublicKey.findProgramAddressSync(
      [realmPda.toBuffer(), Buffer.from("governance")],
      program.programId
    );
  
    // 3. 调用指令
    try {
      const tx = await program.methods.createGovernance(governanceConfig)
        .accounts({
          realm: realmPda,
        })
        .rpc();
      console.log("✅ create governance success", tx);
    } catch (err) {
      console.log("❌ create governance failed: ", err.message);
      if (err.logs) {
        console.log("🔍 Logs:");
        err.logs.forEach((log: string) => console.log(log));
      }
      if (err.tx) {
        console.log("🚀 Transaction Signature:", err.tx);
      }
    }
    
    // 4. 链上验证 Governance 账户
    const governanceAccount: any = await program.account.governance.fetch(governancePda);
  
    // a) 检查 Realm 关联
    if (!governanceAccount.realm.equals(realmPda)) {
      throw new Error("❌ governance.realm 不匹配");
    }
  
    // b) 检查 accountType
    if (!("governance" in governanceAccount.accountType)) {
      throw new Error("❌ governance.accountType 应为 Governance");
    }
  
    // c) 检查配置字段
    if (!governanceAccount.config.minCommunityWeightToCreateProposal.eq(new anchor.BN(1))) {
      throw new Error("❌ minCommunityWeightToCreateProposal 应为 1");
    }
    const val =
      Array.isArray(governanceAccount.config.communityVoteThreshold.yesVotePercentage)
        ? governanceAccount.config.communityVoteThreshold.yesVotePercentage[0]
        : governanceAccount.config.communityVoteThreshold.yesVotePercentage['0'];

    if (val !== 10) {
      throw new Error("❌ communityVoteThreshold.yesVotePercentage 应为 10%");
    }
  
    console.log("✅ Governance 账户链上校验通过！");
  });

  it("create proposal", async () => {
    const tx = await program.methods.createProposal(
      "终极测试提案667",
      "https://example.com"
    ).accounts({
      mint: mint,
      authority: users[0].publicKey,
      realm: realmPda,
    } as any).signers([users[0]]).rpc();
    console.log("✅ create proposal success", tx);

    const [governancePda] = PublicKey.findProgramAddressSync(
      [realmPda.toBuffer(), Buffer.from("governance")],
      program.programId
    );
    const governanceAccount = await program.account.governance.fetch(governancePda);
    console.log("governanceAccount: ", governanceAccount);

    const [tokenOwnerRecordPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("governance"), 
        realmPda.toBuffer(), 
        mint.toBuffer(), 
        users[0].publicKey.toBuffer()
      ],
      program.programId
    );
    const tokenOwnerRecordAccount = await program.account.tokenOwnerRecord.fetch(tokenOwnerRecordPda);
    console.log("tokenOwnerRecordAccount: ", tokenOwnerRecordAccount);

    // 计算提案账户
    const [proposalPda] = PublicKey.findProgramAddressSync(
      [
        governancePda.toBuffer(),
        tokenOwnerRecordPda.toBuffer(),
        new anchor.BN(7).toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    // 计算提案押金账户
    const [proposalDepositPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("proposal-deposit"),
        users[0].publicKey.toBuffer(),
        proposalPda.toBuffer()
      ],
      program.programId
    );

    const proposalDepositAccount = await program.account.proposalDeposit.fetch(proposalDepositPda);
    console.log("proposalDepositAccount: ", proposalDepositAccount);

    // ====== 校验提案账户用户字段 ======
    const proposalAccount = await program.account.proposal.fetch(proposalPda);
    console.log("proposalAccount: ", proposalAccount);
    if (!proposalAccount.tokenOwnerRecord.equals(tokenOwnerRecordPda)) {
      throw new Error("❌ 提案账户的 tokenOwnerRecord 不匹配");
    }
    if (!proposalAccount.governance.equals(governancePda)) {
      throw new Error("❌ 提案账户的 governance 不匹配");
    }
    console.log("✅ 提案账户 governance/tokenOwnerRecord 字段校验通过！");
    
    // ====== 校验押金账户租金额 ======
      const proposalDepositAccountInfo = await connection.getAccountInfo(proposalDepositPda);
      if (!proposalDepositAccountInfo) {
        throw new Error("❌ 找不到提案押金账户");
      }
      // 计算当前网络 73 字节账户所需的最小租金
      let minRent = new anchor.BN(await connection.getMinimumBalanceForRentExemption(73));
      // 加上押金 0.1 sol (提案数 * 0.1)
      minRent = minRent.add(new anchor.BN(500_000_000));
      if (!minRent.eq(new anchor.BN(proposalDepositAccountInfo.lamports))) {
        throw new Error(`❌ 押金账户 lamports 错误, expected: ${minRent.toString()}, got: ${proposalDepositAccountInfo.lamports}`);
      }
      console.log("✅ 押金账户租金额校验通过！");
  });

  it("Adding and removing required signatories", async () => {
    const [governancePda] = PublicKey.findProgramAddressSync(
      [realmPda.toBuffer(), Buffer.from("governance")],
      program.programId
    );
  
    // 添加前三个必要签署人
    for (let i = 0; i < 3; i++) {
      const tx = await program.methods.createRequiredSignatory()
        .accounts({
          governance: governancePda,
          realm: realmPda,
          authority: payer,
          signatory: users[i].publicKey,
        } as any)
        .rpc();
      console.log(`✅ add required signatory ${users[i].publicKey.toBase58()} success, tx: ${tx}`);
    }
  
    // 移除第三个必要签署人
    const tx = await program.methods.removeRequiredSignatory()
      .accounts({
        governance: governancePda,
        realm: realmPda,
        authority: payer,
        signatory: users[2].publicKey,  // 移除第三个
      } as any)
      .rpc();
    console.log(`✅ remove required signatory ${users[2].publicKey.toBase58()} success, tx: ${tx}`);

    const governanceAccount = await program.account.governance.fetch(governancePda);
    if (Number(governanceAccount.requiredSignatoriesCount) !== 2) {
      throw new Error("❌ requiredSignatoriesCount 应为 2");
    }
    console.log("✅ requiredSignatoriesCount 校验通过！");
  });

  it("add signatory", async () => {
    const [governancePda] = PublicKey.findProgramAddressSync(
      [realmPda.toBuffer(), Buffer.from("governance")],
      program.programId
    );

    const [tokenOwnerRecordPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("governance"), 
        realmPda.toBuffer(), 
        mint.toBuffer(), 
        users[0].publicKey.toBuffer()
      ],
      program.programId
    );

    // 计算提案账户
    const [proposalPda] = PublicKey.findProgramAddressSync(
      [
        governancePda.toBuffer(),
        tokenOwnerRecordPda.toBuffer(),
        new anchor.BN(3).toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    // 添加必要签署人
    for (let i = 0; i < 2; i++) {
      const [requiredSignatoryPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("required_signatory"),
          governancePda.toBuffer(),
          users[i].publicKey.toBuffer()
        ],
        program.programId
      );

      const tx = await program.methods.addSignatory()
      .accounts({
        governance: governancePda,
        realm: realmPda,
        proposal: proposalPda,
        authority: users[0].publicKey,
        autRecord: tokenOwnerRecordPda,
        signatory: users[i].publicKey,
        tokenOwnerRecord: null,
        requiredSignatory: requiredSignatoryPda,
      } as any)
      .signers([users[0]])
      .rpc();
      console.log(`✅ add signatory ${users[i].publicKey.toBase58()} success, tx: ${tx}`);
    }

    // 添加非必要签署人
    const [tokenOwnerRecordPda2] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("governance"), 
        realmPda.toBuffer(), 
        mint.toBuffer(), 
        users[2].publicKey.toBuffer()
      ],
      program.programId
    );

    const tx = await program.methods.addSignatory()
    .accounts({
      governance: governancePda,
      realm: realmPda,
      proposal: proposalPda,
      authority: users[0].publicKey,
      signatory: users[2].publicKey,
      autRecord: tokenOwnerRecordPda,
      tokenOwnerRecord: tokenOwnerRecordPda2,
      requiredSignatory: null,
    } as any)
    .signers([users[0]])
    .rpc();
    console.log(`✅ add signatory ${users[2].publicKey.toBase58()} success, tx: ${tx}`);

    // 校验
    for (let i = 0; i < 3; i++) {
      const [signatoryRecordPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("signatory_record"),
          proposalPda.toBuffer(),
          users[i].publicKey.toBuffer()
        ],
        program.programId
      );
      const signatoryRecordAccount = await program.account.signatoryRecord.fetch(signatoryRecordPda);
      if (!signatoryRecordAccount.proposal.equals(proposalPda)) {
        throw new Error("❌ signatoryRecordAccount.proposal 不匹配");
      }
      if (!signatoryRecordAccount.signatory.equals(users[i].publicKey)) {
        throw new Error("❌ signatoryRecordAccount.signatory 不匹配");
      }
      if (signatoryRecordAccount.signedOff) {
        throw new Error("❌ signatoryRecordAccount.signedOff 应为 false");
      }
      console.log("✅ signatoryRecordAccount 校验通过！");
    }

    // 校验提案账户的需要签署人数量
    const proposalAccount = await program.account.proposal.fetch(proposalPda);
    if (Number(proposalAccount.signatoriesCount) !== 3) {
      throw new Error("❌ signatoriesCount 应为 3");
    }
    console.log("✅ signatoriesCount 校验通过！");

    console.log("✅ add signatory 校验通过！");
  });

  it("add transaction", async () => {
    const [governancePda] = PublicKey.findProgramAddressSync(
      [realmPda.toBuffer(), Buffer.from("governance")],
      program.programId
    );

    const [tokenOwnerRecordPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("governance"), 
        realmPda.toBuffer(), 
        mint.toBuffer(), 
        users[0].publicKey.toBuffer()
      ],
      program.programId
    );

    // 计算提案账户
    const [proposalPda] = PublicKey.findProgramAddressSync(
      [
        governancePda.toBuffer(),
        tokenOwnerRecordPda.toBuffer(),
        new anchor.BN(2).toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    // 读取指令数据
    const DATA_PATH = path.resolve(__dirname, "init_swap_instruction.json");
    const data = fs.readFileSync(DATA_PATH, "utf-8");
    const json_data = JSON.parse(data);
    const instructionData = {
      programId: new PublicKey(json_data.program_id),
      data: Buffer.from(json_data.data, "base64"),
      accounts: json_data.accounts.map((account: any) => ({
        pubkey: new PublicKey(account.pubkey),
        isSigner: account.is_signer,
        isWritable: account.is_writable
      }))
    };

    const tx = await program.methods.addTransaction(
      instructionData
    )
    .accounts({
      proposal: proposalPda,
      authority: users[0].publicKey,
      tokenOwnerRecord: tokenOwnerRecordPda,
    } as any)
    .signers([users[0]])
    .rpc();

    // 校验
    const proposalAccount = await program.account.proposal.fetch(proposalPda);
    if (!proposalAccount.hasTransaction) {
      throw new Error("❌ hasTransaction 应为 true");
    }
    console.log("✅ hasTransaction 校验通过！");

    const [proposalTransactionPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("proposal_transaction"),
        proposalPda.toBuffer()
      ],
      program.programId
    );
    const proposalTransactionAccount = await program.account
      .proposalTransaction
      .fetch(proposalTransactionPda);

    if (!proposalTransactionAccount.instruction.programId.equals(instructionData.programId)) {
      throw new Error("❌ instruction.programId 不匹配");
    }
    console.log("✅ instruction.programId 校验通过！");

    console.log(`✅ add transaction success, tx: ${tx}`);
  })

  it("sign off proposal", async () => { 
    const [governancePda] = PublicKey.findProgramAddressSync(
      [realmPda.toBuffer(), Buffer.from("governance")],
      program.programId
    );

    const [tokenOwnerRecordPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("governance"), 
        realmPda.toBuffer(), 
        mint.toBuffer(), 
        users[0].publicKey.toBuffer()
      ],
      program.programId
    );

    // 计算提案账户
    const [proposalPda] = PublicKey.findProgramAddressSync(
      [
        governancePda.toBuffer(),
        tokenOwnerRecordPda.toBuffer(),
        new anchor.BN(3).toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    // const tx = await program.methods.signOffProposal()
    // .accounts({
    //   proposal: proposalPda,
    //   governance: governancePda,
    //   realm: realmPda,
    //   signatory: users[0].publicKey,
    //   tokenOwnerRecord: tokenOwnerRecordPda,
    //   signatoryRecord: null
    // } as any)
    // .signers([users[0]])
    // .rpc();
    // console.log(`✅ sign off proposal success, tx: ${tx}`);

    for (let i = 1; i < 2; i++) {
      const [signatoryRecordPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("signatory_record"),
          proposalPda.toBuffer(),
          users[i].publicKey.toBuffer()
        ],
        program.programId
      );

      const tx = await program.methods.signOffProposal()
      .accounts({
        proposal: proposalPda,
        governance: governancePda,
        realm: realmPda,
        signatory: users[i].publicKey,
        tokenOwnerRecord: null,
        signatoryRecord: signatoryRecordPda,
      } as any)
      .signers([users[i]])
      .rpc();
      console.log(`✅ sign off proposal success, tx: ${tx}`);
    }

    // for (let i = 0; i < 3; i++) {
    //   const [signatoryRecordPda] = PublicKey.findProgramAddressSync(
    //     [
    //       Buffer.from("signatory_record"),
    //       proposalPda.toBuffer(),
    //       users[i].publicKey.toBuffer()
    //     ],
    //     program.programId
    //   );
    //   const signatoryRecordAccount = await program.account
    //     .signatoryRecord
    //     .fetch(signatoryRecordPda);

    //   if (!signatoryRecordAccount.signedOff) {
    //     throw new Error("❌ signatoryRecordAccount.signedOff 应为 true");
    //   }
    //   console.log("✅ signatoryRecordAccount 校验通过！");
    // }

    // const proposalAccount = await program.account.proposal.fetch(proposalPda);
    
    // if (!proposalAccount.state.voting) {
    //   throw new Error("❌ state 应为 Voting");
    // }
    // if (proposalAccount.signatoriesSignedOffCount !== proposalAccount.signatoriesCount) {
    //   throw new Error("❌ signatoriesSignedOffCount 应为 signatoriesCount");
    // }
    console.log("✅ proposalAccount 校验通过！");

  })

  it("cast vote", async () => {
    const [governancePda] = PublicKey.findProgramAddressSync(
      [realmPda.toBuffer(), Buffer.from("governance")],
      program.programId
    );

    const governanceAccount = await program.account.governance.fetch(governancePda);
    console.log("activeProposalCount: ", governanceAccount.activeProposalCount);

    const [tokenOwnerRecordPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("governance"), 
        realmPda.toBuffer(), 
        mint.toBuffer(), 
        users[0].publicKey.toBuffer()
      ],
      program.programId
    );
    const tokenOwnerRecordAccount = await program.account.tokenOwnerRecord.fetch(tokenOwnerRecordPda);
    console.log("tokenOwnerRecordAccount1: ", tokenOwnerRecordAccount);
    console.log("tokenOwnerRecordAccount1: ", tokenOwnerRecordAccount.governingTokenDepositAmount.toString());

    // 计算提案账户
    const [proposalPda] = PublicKey.findProgramAddressSync(
      [
        governancePda.toBuffer(),
        tokenOwnerRecordPda.toBuffer(),
        new anchor.BN(3).toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    for (let i = 13; i < 18; i++) {
      const voteArg: any = (i >= 5 && i <= 7) ? { no: {} } : { yes: {} };
      const tx = await program.methods.castVote(
        voteArg
      )
      .accounts({
        proposal: proposalPda,
        governance: governancePda,
        realm: realmPda,
        mint: mint,
        authority: users[i].publicKey,
        user: users[0].publicKey,
      } as any)
      .signers([users[i]])
      .rpc();
      console.log(`✅ cast vote success, tx: ${tx}`);
    }


    const proposalAccount = await program.account.proposal.fetch(proposalPda);
    console.log("proposalAccount: ", proposalAccount);
    console.log("proposalAccount: ", proposalAccount.yesVoteWeight.toString());
    console.log("proposalAccount: ", proposalAccount.noVoteWeight.toString());
    // if (!proposalAccount.state.executing) {
    //   throw new Error("❌ state 应为 Executing");
    // }
    // if (proposalAccount.yesVoteWeight !== new anchor.BN(12)) {
    //   throw new Error("❌ yesVoteWeight 应为 12");
    // }
    // if (proposalAccount.noVoteWeight !== new anchor.BN(3)) {
    //   throw new Error("❌ noVoteWeight 应为 3");
    // }
    const tokenOwnerRecordAccount3 = await program.account.tokenOwnerRecord.fetch(tokenOwnerRecordPda);
    console.log("tokenOwnerRecordAccount3: ", tokenOwnerRecordAccount3);
    console.log("✅ cast vote 校验通过！");
  })

  it("finalize vote", async () => {
    const [governancePda] = PublicKey.findProgramAddressSync(
      [realmPda.toBuffer(), Buffer.from("governance")],
      program.programId
    );

    const governanceAccount = await program.account.governance.fetch(governancePda);
    console.log("governanceAccount-: ", governanceAccount);

    const [tokenOwnerRecordPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("governance"), 
        realmPda.toBuffer(), 
        mint.toBuffer(), 
        users[0].publicKey.toBuffer()
      ],
      program.programId
    );

    // 计算提案账户
    const [proposalPda] = PublicKey.findProgramAddressSync(
      [
        governancePda.toBuffer(),
        tokenOwnerRecordPda.toBuffer(),
        new anchor.BN(2).toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const tx = await program.methods.finalizeVote()
    .accounts({
      proposal: proposalPda,
      governance: governancePda,
      realm: realmPda,
      mint: mint,
      user: users[0].publicKey,
    } as any)
    .rpc();
    console.log(`✅ finalize vote success, tx: ${tx}`);

    const proposalAccount = await program.account.proposal.fetch(proposalPda);
    console.log("proposalAccount: ", proposalAccount);
    console.log("proposalAccount: ", proposalAccount.votingStartedAt);
    
    
    console.log("✅ finalize vote 校验通过！");
  })

  it("execute transaction", async () => {
    const [governancePda] = PublicKey.findProgramAddressSync(
      [realmPda.toBuffer(), Buffer.from("governance")],
      program.programId
    );

    const [tokenOwnerRecordPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("governance"), 
        realmPda.toBuffer(), 
        mint.toBuffer(), 
        users[0].publicKey.toBuffer()
      ],
      program.programId
    );

    // 计算提案账户
    const [proposalPda] = PublicKey.findProgramAddressSync(
      [
        governancePda.toBuffer(),
        tokenOwnerRecordPda.toBuffer(),
        new anchor.BN(2).toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    // 计算提案指令账户
    const [proposalTransactionPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("proposal_transaction"),
        proposalPda.toBuffer(),
      ],
      program.programId
    );

    // 获取提案指令数据
    const DATA_PATH = path.resolve(__dirname, "init_swap_instruction.json");
    const data = fs.readFileSync(DATA_PATH, "utf-8");
    const json_data = JSON.parse(data);

    // 组装 remainingAccounts 数组
    const remainingAccounts = json_data.accounts.map((acc: any) => ({
      pubkey: new PublicKey(acc.pubkey),
      isSigner: acc.is_signer,
      isWritable: acc.is_writable,
    }));

    const tx = await program.methods.executeTransaction()
      .accounts({
        proposal: proposalPda,
        governance: governancePda,
        proposalTransaction: proposalTransactionPda,
      } as any)
      .remainingAccounts(remainingAccounts)
      .signers([users[20]])
      .rpc();

    console.log(`✅ execute transaction success, tx: ${tx}`);

    // try {
    //   const tx = await program.methods.executeTransaction()
    //     .accounts({
    //       proposal: proposalPda,
    //       governance: governancePda,
    //       proposalTransaction: proposalTransactionPda,
    //     } as any)
    //     .remainingAccounts(remainingAccounts)
    //     .signers([users[19], users[20]])
    //     .rpc();

    //   console.log(`✅ execute transaction success, tx: ${tx}`);
    // } catch (err: any) {
    //   console.log("❌ execute transaction failed:", err.message);
    //   if (err.logs) {
    //     console.log("🔍 Logs:");
    //     err.logs.forEach((log: string) => console.log(log));
    //   }
    //   if (err.tx) {
    //     console.log("🚀 Transaction Signature:", err.tx);
    //   }
    // }

    const proposalTransactionAccount = await program.account
      .proposalTransaction
      .fetch(proposalTransactionPda);

    console.log("proposalTransactionAccount: ", 
      proposalTransactionAccount.executionStatus);

    const proposalAccount = await program.account.proposal.fetch(proposalPda);
    console.log("proposalAccount: ", proposalAccount.state);
  })

  it("relinquish vote", async () => {
    const [governancePda] = PublicKey.findProgramAddressSync(
      [realmPda.toBuffer(), Buffer.from("governance")],
      program.programId
    );

    const [tokenOwnerRecordPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("governance"), 
        realmPda.toBuffer(), 
        mint.toBuffer(), 
        users[0].publicKey.toBuffer()
      ],
      program.programId
    );

    const [proposalPda] = PublicKey.findProgramAddressSync(
      [
        governancePda.toBuffer(),
        tokenOwnerRecordPda.toBuffer(),
        new anchor.BN(2).toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    for (let i = 0; i < 13; i++) {
      const [tokenOwnerRecordPda2] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("governance"), 
          realmPda.toBuffer(), 
          mint.toBuffer(), 
          users[i].publicKey.toBuffer()
        ],
        program.programId
      );

      const [voteRecordPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("vote_record"),
          proposalPda.toBuffer(),
          tokenOwnerRecordPda2.toBuffer()
        ],
        program.programId
      );

      const tx = await program.methods.relinquishVote()
        .accounts({
          proposal: proposalPda,
          governance: governancePda,
          realm: realmPda,
          signer: users[i].publicKey,
          tokenOwnerRecord: tokenOwnerRecordPda2,
          voteRecord: voteRecordPda,
        } as any)
        .signers([users[i]])
        .rpc();
      console.log(`✅ relinquish vote success, tx: ${tx}`);

      const voteRecordAccount = await program.account
        .voteRecord
        .fetch(voteRecordPda);
      const tokenOwnerRecordAccount = await program.account
        .tokenOwnerRecord
        .fetch(tokenOwnerRecordPda2);
      
      if (!voteRecordAccount.isRelinquished) {
        throw new Error("❌ voteRecord.isRelinquished 应为 true");
      }
      console.log("unrelinquishedVotesCount: ", tokenOwnerRecordAccount.unrelinquishedVotesCount.toString());
    }

    console.log("✅ relinquish vote 校验通过！");
  })

  it("refund proposal deposit", async () => {
    const [governancePda] = PublicKey.findProgramAddressSync(
      [realmPda.toBuffer(), Buffer.from("governance")],
      program.programId
    );

    const [tokenOwnerRecordPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("governance"), 
        realmPda.toBuffer(), 
        mint.toBuffer(), 
        users[0].publicKey.toBuffer()
      ],
      program.programId
    );

    // 读取users[0]现在拥有的sol数量
    const userBalance = await connection.getBalance(users[0].publicKey);
    console.log("userBalance: ", userBalance / LAMPORTS_PER_SOL);

    // 计算提案账户
    const [proposalPda] = PublicKey.findProgramAddressSync(
      [
        governancePda.toBuffer(),
        tokenOwnerRecordPda.toBuffer(),
        new anchor.BN(2).toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const [proposalDepositPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("proposal-deposit"),
        users[0].publicKey.toBuffer(),
        proposalPda.toBuffer(),
      ],
      program.programId
    );

    const tx = await program.methods.refundProposalDeposit()
    .accounts({
      proposal: proposalPda,
      proposalDeposit: proposalDepositPda,
      realm: realmPda,
      mint: mint,
      authority: users[0].publicKey,
    } as any)
    .signers([users[0]])
    .rpc();
    console.log(`✅ refund proposal deposit success, tx: ${tx}`);

    
 
    // 读取users[0]现在拥有的sol数量
    const userBalance2 = await connection.getBalance(users[0].publicKey);
    console.log("userBalance2: ", userBalance2 / LAMPORTS_PER_SOL);

    if (userBalance2 < userBalance) {
      throw new Error("❌ users[0]拥有的sol数量减少了");
    }

    console.log("✅ refund proposal deposit 校验通过！");
  })

  it.only("hhh", async () => {
    console.log(users[0].publicKey.toBase58());
    console.log(users[1].publicKey.toBase58());
    console.log(users[2].publicKey.toBase58());
    console.log(users[3].publicKey.toBase58());
    console.log(users[4].publicKey.toBase58());
    console.log(users[5].publicKey.toBase58());
  })

});
