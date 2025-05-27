use anchor_lang::prelude::*;

use super::GovernanceAccountType;


#[derive(AnchorDeserialize, AnchorSerialize, Debug, Clone)]
pub enum MintMaxVoterWeightSource {
    /// 按总供应量的一定比例来限制最大投票权（参数为分子，分母为 10_000）
    SupplyFraction(u64),
    /// 固定的最大投票权值
    Absolute(u64)
}


#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct RealmConfig {
    /// 预留字段，用于未来扩展
    pub reserved: [u8; 6],
    /// 创建治理实例所需的最小社区代币权重
    pub min_community_weight_to_create_governance: u64,
    /// 社区代币最大投票权来源配置（如：按总供应量比例，或绝对值）
    pub community_mint_max_voter_weight_source: MintMaxVoterWeightSource,
}


#[account]
pub struct Realm {
    /// DAO 名称（最长 32 字节）
    pub name: String,
    /// 账户类型标识，用于区分不同类型的治理账户
    pub account_type: GovernanceAccountType,
    /// 社区治理代币的 Mint 公钥地址
    pub community_mint: Pubkey,
    /// Realm 的配置（含最大票权、最小治理权等参数）
    pub config: RealmConfig,
    /// 预留空间，便于未来升级
    pub reserved: [u8; 128],
    /// DAO 当前的治理权拥有者（可选）
    pub authority: Option<Pubkey>,
}

impl Realm {
    /// 账户数据空间大小（单位：字节）
    /// 8   : Anchor账户判别符 (discriminator，自动添加)
    /// 4+32: name 字符串（4字节长度 + 最多32字节内容）
    /// 1   : account_type 枚举（u8）
    /// 32  : community_mint 公钥（Pubkey）
    /// RealmConfig : 子配置结构体大小
    /// 128 : reserved 字段（预留空间）
    /// 33  : authority 可选公钥（Option<Pubkey>，1字节 tag + 32字节 pubkey）
    pub const LEN: usize = 8 + 4 + 32 + 1 + 32 + 23 + 128 + 33;
    pub const REALM_SEEDS: &'static [u8] = b"realm";
}
