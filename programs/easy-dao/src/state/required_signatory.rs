//! 必须签名者账户
use anchor_lang::prelude::*;

use super::GovernanceAccountType;


#[account]
pub struct RequiredSignatory {
    /// 账户类型
    pub account_type: GovernanceAccountType,
    /// 治理账户
    pub governance: Pubkey,
    /// 签名者
    pub signatory: Pubkey,
}


impl RequiredSignatory {
    pub const LEN: usize = 8 + 1 + 32 + 32;
    pub const REQUIRED_SIGNATORY_SEED: &'static [u8] = b"required_signatory";
}
