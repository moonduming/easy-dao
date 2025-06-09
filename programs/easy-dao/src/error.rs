use anchor_lang::prelude::*;


#[error_code]
pub enum GovernanceError {
    #[msg("Realm 中的社区代币 mint 与传入的不一致")]
    InvalidCommunityMint,

    #[msg("无效的治理代币拥有者账户")]
    InvalidGoverningTokenOwner,

    #[msg("Realm 配置账户与 Realm 地址不一致")]
    InvalidRealmConfigAccount,

    #[msg("TokenOwnerRecord 账户与用户地址不一致")]
    InvalidTokenOwnerRecordOwner,

    #[msg("存入的治理代币数量必须大于零")]
    InvalidDepositAmount,

    #[msg("数值溢出")]
    Overflow,

    #[msg("治理配置中的投票门槛百分比超出范围")]
    InvalidVoteThresholdPercentage,

    #[msg("当前 VoteThreshold 类型尚不支持")]
    VoteThresholdTypeNotSupported,

    #[msg("无效的免押金提案数量")]
    InvalidDepositExemptProposalCount,

    #[msg("无权限，必须是 Realm 管理员")]
    UnauthorizedRealmAuthority,

    #[msg("此类型的治理代币不允许用于投票")]
    GoverningTokenMintNotAllowedToVote,

    #[msg("TokenOwnerRecord 所属 Realm 与当前 Realm 不一致")]
    InvalidTokenOwnerRecordRealm,

    #[msg("Governance 账户的 realm 与传入的 realm 不匹配")]
    InvalidGovernanceRealm,

    #[msg("必要签名账户不属于治理账户")]
    InvalidRequiredGovernance,

    #[msg("账户的 governance 字段与传入的 governance 不一致")]
    InvalidGovernanceForAccount,

    #[msg("Proposal 的 TokenOwnerRecord 字段与传入的不一致")]
    InvalidProposalTokenOwnerRecord,

    #[msg("必要签名账户与传入的不一致")]
    InvalidRequiredSignatory,

    #[msg("提案当前状态不允许执行此操作")]
    InvalidProposalState,

    #[msg("提案已被签署")]
    ProposalAlreadySignedOff,

    #[msg("缺少 RequiredSignatory 账户")]
    MissingRequiredSignatory,

    #[msg("用户持有的治理代币不足，无法创建提案")]
    InsufficientVotingPower,
    
    #[msg("投票持续时间必须大于 0")]
    InvalidVotingDuration,

    #[msg("提案投票期已过")]
    ProposalVotingTimeExpired,

    #[msg("提案标题过长，最多 50 字节")]
    NameTooLong,

    #[msg("描述链接过长，最多 255 字节")]
    LinkTooLong,

    #[msg("提案仍在投票期内，无法执行该操作")]
    ProposalStillInVoting,

    #[msg("投票已被释放，不能重复操作")]
    VoteAlreadyRelinquished,

    #[msg("提案已包含执行指令，不能重复添加")]
    TransactionAlreadyExists,

    #[msg("指令账户的 proposal 字段与传入的 proposal 不一致")]
    InvalidProposalForTransaction,

    #[msg("当前提案状态不允许执行指令")]
    InvalidStateCannotExecuteTransaction,

    #[msg("该指令已被执行，不能重复执行")]
    TransactionAlreadyExecuted,

    #[msg("剩余账户数量与指令元信息不匹配")]
    InvalidInstructionAccounts,

    #[msg("ProposalDeposit 账户与当前 Proposal 不一致")]
    InvalidProposalDepositProposal,

    #[msg("ProposalDeposit 账户的 payer 与传入的 payer 不一致")]
    InvalidProposalDepositDepositPayer,
}
