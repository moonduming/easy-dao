//! 用户治理账户
use anchor_lang::prelude::*;

use crate::error::GovernanceError;

use super::GovernanceAccountType;


#[derive(AnchorDeserialize, AnchorSerialize, Debug, Default, Clone)]
pub struct TokenOwnerRecordLock {
    /// 锁的唯一标识符（用于区分不同来源的锁，比如质押、插件、外部模块）
    pub lock_id: u8,
    /// 拥有解除该锁权限的地址（通常是插件或治理合约）
    pub authority: Pubkey,
    /// 锁过期时间戳；若为 `u64::MAX` 表示永久锁
    pub expiry: u64
}


#[account]
pub struct TokenOwnerRecord {
    /// 账户类型（标识这是一个 TokenOwnerRecord）
    pub account_type: GovernanceAccountType,
    /// 所属治理领域 Realm 的地址
    pub realm: Pubkey,
    /// 治理代币的 Mint 地址（可以是社区或理事会）
    pub governing_token_mint: Pubkey,
    /// 用户的治理代币所有者地址
    pub governing_token_owner: Pubkey,
    /// 用户在治理领域中存入的治理代币数量
    pub governing_token_deposit_amount: u64,
    /// 用户未释放的投票计数（表示当前仍处于活跃提案中）
    pub unrelinquished_votes_count: u64,
    /// 用户创建但尚未签署或撤销的提案数量
    pub outstanding_proposal_count: u8,
    /// 当前记录的版本号（用于未来兼容）
    pub version: u8,
    /// 用户授权的治理代理人地址（可代为投票和提案）
    pub governance_delegate: Option<Pubkey>,
    /// 对用户治理代币存款的外部锁列表（如插件、质押等设置的锁定）
    pub locks: Vec<TokenOwnerRecordLock>,
    pub proposal_index: u64
}


impl TokenOwnerRecord {
    pub const RECORD_SEED: &'static [u8] = b"governance";
    pub const TOKEN_OWNER_RECORD_LAYOUT_VERSION: u8 = 1;
    pub const MAX_LOCKS: usize = 5;
    /// TokenOwnerRecord 的序列化长度（单位：字节）
    /// 包含基本治理信息、可选代理地址，以及最多 MAX_LOCKS 个锁记录（每个 41 字节）
    pub const LEN: usize = 8 + 1 + 32 * 3 + 8 * 2 + 2 + 33 + 8 + 4 + Self::MAX_LOCKS * 41;

    pub fn decrease_outstanding_proposal_count(&mut self) -> Result<()> {
        if self.outstanding_proposal_count != 0 {
            self.outstanding_proposal_count = self.outstanding_proposal_count
                .checked_sub(1)
                .ok_or(error!(GovernanceError::Overflow))?;
        }
        Ok(())
    }
}
