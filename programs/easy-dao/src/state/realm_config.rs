//! 配置账户，用于配置DAO的配置信息

use anchor_lang::prelude::*;

use super::GovernanceAccountType;


#[derive(Clone, Debug, AnchorSerialize, AnchorDeserialize)]
pub struct Reserved110 {
    /// Reserved 64 bytes
    pub reserved64: [u8; 64],
    /// Reserved 32 bytes
    pub reserved32: [u8; 32],
    /// Reserved 4 bytes
    pub reserved14: [u8; 14] // 110 - 64 - 32 = 14
}

impl Default for Reserved110 {
    fn default() -> Self {
        Self {
            reserved64: [0; 64],
            reserved32: [0; 32],
            reserved14: [0; 14],
        }
    }
}


/// 治理代币类型，用于控制代币的流动性与回收权限
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub enum GoverningTokenType {
    /// 流动型代币，可随时存入与取出
    Liquid,
    /// 成员制代币，不可主动取出，可由DAO回收
    Membership,
    /// 休眠代币，当前不允许参与治理
    Dormant
}

impl Default for GoverningTokenType {
    fn default() -> Self {
        Self::Liquid
    }
}

/// 治理代币的配置，用于扩展代币的投票行为与治理规则
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default)]
pub struct GoverningTokenConfig {
    /// 可选的投票权插件地址
    pub voter_weight_addin: Option<Pubkey>,
    /// 可选的最大投票权插件地址
    pub max_voter_weight_addin: Option<Pubkey>,
    /// 代币的类型
    pub token_type: GoverningTokenType,
    /// 保留字段，用于未来扩展
    pub reserved: [u8; 4],
    /// 有权锁定该代币功能的权限地址列表
    pub lock_authorities: [Pubkey; 5]
}

/// Realm配置账户，用于存储社区与委员会治理代币的配置
#[account]
pub struct RealmConfigAccount {
    /// 账户类型标识
    pub account_type: GovernanceAccountType,
    /// 所属的Realm公钥
    pub realm: Pubkey,
    /// 社区代币配置
    pub community_token_config: GoverningTokenConfig,
    /// 保留字段，用于未来扩展
    pub reserved: Reserved110,
}

impl RealmConfigAccount {
    /// 账户数据空间大小
    /// 8   : Anchor账户判别符 (discriminator，Anchor自动加)
    /// 1: 账户类型 (u8)
    /// 32: Realm 公钥 (Pubkey)
    /// 110: 保留字段 (Reserved110, 64+32+14)
    /// 74: 社区代币配置 GoverningTokenConfig 的固定部分
    /// 32*5: 最多可存 5 个权限管理者 (每个 Pubkey 32 字节)
    /// 总计可支持 5 个 lock_authorities 成员
    pub const LEN: usize = 8 + 1 + 32 + 110 + 71 + 32 * 5;
    pub const REALM_CONFIG_SEEDS: &'static [u8] = b"realm_config";
    pub const COMMUNITY_TOKEN_SEEDS: &'static [u8] = b"community_token";
}
