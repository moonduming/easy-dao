//! 创建管理目标账户

use anchor_lang::prelude::*;

use super::{GovernanceAccountType, VoteThreshold};
use crate::error::GovernanceError;


#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone)]
/// 投票提前通过机制
pub enum VoteTipping {
    /// 严格投票，不支持提前结束
    Strict,
    /// 允许提前通过（如达到门槛时即结束）
    Early,
    /// 禁用（投票始终无效/不计票）
    Disabled,
}


#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone)]
// DAO 治理参数配置（社区投票专用版）
pub struct GovernanceConfig {
    /// 社区投票门槛
    /// 例: YesVotePercentage(60) 表示需有 60% 赞成票才算通过
    pub community_vote_threshold: VoteThreshold,

    /// 创建提案所需的最小社区权重
    /// 例: 至少质押 1000 token 才能发起提案
    pub min_community_weight_to_create_proposal: u64,

    /// 提案中每笔事务的锁定时长（单位：秒）
    pub transactions_hold_up_time: u32,

    /// 投票基础时长（单位：秒）
    /// 例: 提案发起后至少要开放投票多少时间
    pub voting_base_time: u32,

    /// 社区投票的提前通过规则
    /// 例: Early 表示提前达到门槛即可结束投票
    pub community_vote_tipping: VoteTipping,

    /// 投票结束后的冷却期（单位：秒）
    pub voting_cool_off_time: u32
}


#[account]
pub struct Governance {
    /// 账户类型标识（方便区分 PDA 类型）
    pub account_type: GovernanceAccountType,
    /// 所属的 Realm（DAO 管理域）的 Pubkey
    pub realm: Pubkey,
    /// 治理对象的种子（可以用来标记或辅助 PDA 派生）
    pub governance_seed: u8,
    /// 社区治理参数配置
    pub config: GovernanceConfig,
    /// 当前需要签名的成员数量（如多签/执行时需要）
    pub required_signatories_count: u8,
    /// 当前活跃的提案数量（可用于限制/展示等场景）
    pub active_proposal_count: u64,
}


impl Governance {
    /// 免押金提案的默认数量
    pub const DEFAULT_DEPOSIT_EXEMPT_PROPOSAL_COUNT: u8 = 10;
    /// 创建提案时需要缴纳的安全押金（投票结束或提案取消后可退还)
    pub const SECURITY_DEPOSIT_BASE_LAMPORTS: u64 = 100_000_000; // 0.1 SOL
    /// 账户大小
    pub const LEN: usize = 8 + 1 + 32 * 2 + 23 + 1 + 8;
    /// 种子
    pub const GOVERNANCE_SEED: &'static [u8] = b"governance";

    pub fn assert_is_valid_vote_threshold(
        vote_threshold: &VoteThreshold
    ) -> Result<()> {
        match *vote_threshold {
            VoteThreshold::YesVotePercentage(yes_vote_threshold_percentage) => {
                if !(1..=100).contains(&yes_vote_threshold_percentage) {
                    return err!(GovernanceError::InvalidVoteThresholdPercentage);
                }
            },
            VoteThreshold::QuorumPercentage(_) => {
                return err!(GovernanceError::VoteThresholdTypeNotSupported);
            },
            VoteThreshold::Disabled => {}
        }

        Ok(())
    }

    pub fn resolve_vote_threshold(&self) -> Result<()> {
        if self.config.community_vote_threshold == VoteThreshold::Disabled {
            return err!(GovernanceError::GoverningTokenMintNotAllowedToVote)
        }

        Ok(())
    }

    pub fn get_proposal_deposit_amount(&self) -> u64 {
        self.active_proposal_count
            .saturating_mul(Self::SECURITY_DEPOSIT_BASE_LAMPORTS)
    }

}
