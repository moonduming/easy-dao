//! 提案账户
use anchor_lang::prelude::*;

use crate::error::GovernanceError;

use super::{GovernanceAccountType, GovernanceConfig, MintMaxVoterWeightSource, VoteThreshold};

/// 提案生命周期状态（精简版）
#[derive(AnchorDeserialize, AnchorSerialize, Clone, Debug, PartialEq, Eq)]
pub enum ProposalState {
    /// 草稿阶段，尚未开始投票
    Draft,
    /// 签署中：第一个签署人签署后进入该状态，所有人签署完后离开该状态
    SigningOff,
    /// 投票进行中
    Voting,
    /// 未达到通过门槛
    Defeated,
    /// 执行中
    Executing,
    /// 执行失败
    ExecutionFailed,
    /// 已完成
    Completed
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
    /// 签署通过时间
    pub signing_off_at: Option<u64>,
    /// 当前提案状态
    pub state: ProposalState,
    /// YES 赞成票权重总和
    pub yes_vote_weight: u64,
    /// NO 反对票权重总和
    pub no_vote_weight: u64,
    /// 投票开始的 Unix 时间戳（秒）
    pub voting_started_at: u64,
    /// 投票完成的 Unix 时间戳（秒）；实际完成时间；若投票尚未结束则为 None
    pub voting_completed_at: Option<u64>,
    /// 提案关闭时间
    pub closed_at: Option<u64>,
    /// 提案通过门槛配置
    pub vote_threshold: Option<VoteThreshold>,
    /// 是否包含需要执行的链上指令
    pub has_transaction: bool,
    /// 提案标题
    pub name: String,
    /// 提案详情的外链（IPFS / Arweave 等）
    pub description_link: String,
}


impl Proposal {
    /// 账户大小，标题最多50字，详情外链255
    pub const LEN: usize = 8 + 1 + 32 * 2 + 2 + 9 + 1 + 8 * 3 + 9 + 9 + 3 + 1 + 4 + 64 + 4 + 255;

    pub fn assert_can_cast_vote(&self, config: &GovernanceConfig) -> Result<()> {
        require!(
            self.state == ProposalState::Voting, 
            GovernanceError::InvalidProposalState
        );

        let now = Clock::get()?.unix_timestamp.try_into()?;
        let end = self.voting_started_at 
            + config.voting_base_time as u64 
            + config.voting_cool_off_time as u64;

        require!(end > now, GovernanceError::ProposalVotingTimeExpired);

        Ok(())
    }

    pub fn get_max_voter_weight_from_mint_supply(
        &self, 
        mint_supply: u64,
        mint_decimals: u8,
        mint_max_voter_weight_source: MintMaxVoterWeightSource
    ) -> Option<u128> {
        let max_voter_weight = match mint_max_voter_weight_source {
            MintMaxVoterWeightSource::SupplyFraction(fraction) => {
                u128::from(mint_supply)
                    .checked_mul(u128::from(fraction))?
                    .checked_div(u128::from(MintMaxVoterWeightSource::SUPPLY_FRACTION_BASE))?
                    .checked_div(10u128.pow(mint_decimals as u32))?
            },
            MintMaxVoterWeightSource::Absolute(amount) => u128::from(amount),
        };
        Some(max_voter_weight)
    }

    pub fn maybe_finalize_vote(
        &mut self,
        max_voter_weight: u128,
        vote_threshold: VoteThreshold
    ) -> Result<bool> {
        let numerator = match vote_threshold {
            VoteThreshold::YesVotePercentage(yes_vote_threshold_percentage) => {
                u128::from(yes_vote_threshold_percentage)
            },
            VoteThreshold::Disabled => {
                return err!(GovernanceError::GoverningTokenMintNotAllowedToVote);
            }
        };

        let yes_vote_threshold = (numerator * max_voter_weight + 100 - 1) / 100;

        if let Ok(threshold_u64) = u64::try_from(yes_vote_threshold) {
            if self.yes_vote_weight >= threshold_u64 {
                let now = Clock::get()?.unix_timestamp.try_into()?;

                if self.has_transaction {
                    self.state = ProposalState::Executing;
                } else {
                    self.state = ProposalState::Completed;
                    self.closed_at = Some(now);
                }
                self.voting_completed_at = Some(now);
                self.vote_threshold = Some(vote_threshold);
                Ok(true)
            } else {
                Ok(false)
            }
        } else {
            return err!(GovernanceError::Overflow);
        }
    }

    pub fn assert_can_finalize_vote(
        &self,
        config: &GovernanceConfig
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp.try_into()?;
        let end = self.voting_started_at 
            + config.voting_base_time as u64 
            + config.voting_cool_off_time as u64;

        require!(end < now, GovernanceError::ProposalStillInVoting);

        require!(
            matches!(
                self.state,
                ProposalState::Draft
                    | ProposalState::SigningOff
                    | ProposalState::Voting
            ),
            GovernanceError::ProposalNotFinalizable
        );
        
        Ok(())
    }
}
