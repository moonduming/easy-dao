//! 投票记录账户
use anchor_lang::prelude::*;

use super::GovernanceAccountType;


#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Eq, PartialEq)]
pub enum Vote {
    /// 是
    Yes,
    /// 否
    No
}


#[account]
pub struct VoteRecord {
    /// 账户类型
    pub account_type: GovernanceAccountType,
    /// 提案地址
    pub proposal: Pubkey,
    /// 治理代币拥有者地址
    pub governing_token_owner: Pubkey,
    /// 是否已释放
    pub is_relinquished: bool,
    /// 投票权重
    pub vote_weight: u64,
    /// 投票结果
    pub vote: Vote,
}


impl VoteRecord {
    pub const LEN: usize = 8 + 1 + 32 + 32 + 8 + 1;
    pub const VOTERECORD_SEED: &'static [u8] = b"vote_record";
}

