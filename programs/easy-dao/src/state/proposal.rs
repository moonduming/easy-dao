use anchor_lang::prelude::*;

use super::{GovernanceAccountType, VoteThreshold};

/// 提案生命周期状态（精简版）
#[derive(AnchorDeserialize, AnchorSerialize, Clone, Debug)]
pub enum ProposalState {
    /// 草稿阶段，尚未开始投票
    Draft,
    /// 投票进行中
    Voting,
    /// 达到通过门槛
    Succeeded,
    /// 未达到通过门槛
    Defeated,
    /// 已被管理员或发起人取消
    Cancelled,
}


#[account]
/// DAO 提案账户（精简版）
pub struct Proposal {
    /// 账户类型标识
    pub account_type: GovernanceAccountType,
    /// 所属 Governance PDA
    pub governance: Pubkey,
    /// 提案发起人的 TokenOwnerRecord
    pub token_owner_record: Pubkey,
    /// 需签署审核人数
    pub signatories_count: u8,
    /// 已签署通过人数
    pub signatories_signed_off_count: u8,
    /// 当前提案状态
    pub state: ProposalState,
    /// YES 赞成票权重总和
    pub yes_vote_weight: u64,
    /// NO 反对票权重总和
    pub no_vote_weight: u64,
    /// 投票开始的 Unix 时间戳（秒）
    pub voting_started_at: u64,
    /// 计划的投票截止 Unix 时间戳（秒）
    pub voting_deadline: u64,
    /// 投票完成的 Unix 时间戳（秒）；实际完成时间；若投票尚未结束则为 None
    pub voting_completed_at: Option<u64>,
    /// 提案通过门槛配置
    pub vote_threshold: VoteThreshold,
    /// 提案标题
    pub name: String,
    /// 提案详情的外链（IPFS / Arweave 等）
    pub description_link: String,
}


impl Proposal {
    /// 账户大小，标题最多50字，详情外链255
    pub const LEN: usize = 8 + 1 + 32 * 2 + 1 + 8 * 4 + 9 + 2 + 4 + 64 + 4 + 255;
}
