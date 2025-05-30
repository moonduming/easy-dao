use anchor_lang::prelude::*;

use super::GovernanceAccountType;


#[account]
pub struct ProposalDeposit {
    /// 账户类型
    pub account_type: GovernanceAccountType,
    /// 提案地址
    pub proposal: Pubkey,
    /// 支付人
    pub deposit_payer: Pubkey
}


impl ProposalDeposit {
    pub const LEN: usize = 8 + 1 + 32 + 32;
    pub const PROPOSAL_DEPOSIT_SEED: &'static [u8] = b"proposal-deposit";
}
