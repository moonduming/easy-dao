use anchor_lang::prelude::*;

use super::GovernanceAccountType;


#[account]
pub struct SignatoryRecord {
    /// 账户类型
    pub account_type: GovernanceAccountType,
    /// 提案地址
    pub proposal: Pubkey,
    /// 签名者地址
    pub signatory: Pubkey,
    /// 是否签署了提案
    pub signed_off: bool
}


impl SignatoryRecord {
    pub const LEN: usize = 8 + 1 + 32 + 32 + 1;
    pub const SIGNATORY_RECORD_SEED: &'static [u8] = b"signatory_record";
}
