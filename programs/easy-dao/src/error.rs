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

    #[msg("治理代币数量溢出")]
    DepositAmountOverflow,

    #[msg("治理配置中的投票门槛百分比超出范围")]
    InvalidVoteThresholdPercentage,

    #[msg("当前 VoteThreshold 类型尚不支持")]
    VoteThresholdTypeNotSupported,

    #[msg("无效的免押金提案数量")]
    InvalidDepositExemptProposalCount,

    #[msg("无权限，必须是 Realm 管理员")]
    UnauthorizedRealmAuthority,
}
