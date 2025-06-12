//! 指令账户
use anchor_lang::prelude::*;

use crate::GovernanceAccountType;


#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct AccountMeta {
    /// 账户公钥
    pub pubkey: Pubkey,
    /// 是否为签名者
    pub is_signer: bool,
    /// 是否为可写账户
    pub is_writable: bool,
}


#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct InstructionData {
    /// 被调用的合约程序 ID
    pub program_id: Pubkey,
    /// 编码后的指令数据
    pub data: Vec<u8>,
    /// 调用指令所需的账户元信息列表
    pub accounts: Vec<AccountMeta>, 
}


impl InstructionData {
    /// 返回序列化后（已含 Vec 长度前缀）的字节数，**不会返回 Result**
    pub fn serialized_len(&self) -> usize {
        // try_to_vec() 只在极端情况下失败；unwrap() 安全可接受，
        // 若想完全避免 panic，可在调用处先保证数据正确。
        self.try_to_vec().unwrap().len()
    }
}


#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default)]
pub enum ExecutionStatus {
    /// 尚未执行
    #[default]
    Pending,
    /// 执行成功
    Success,
    /// 执行失败
    Error,
}


#[account]
pub struct ProposalTransaction {
    /// 当前账户类型标记
    pub account_type: GovernanceAccountType,
    /// 所属提案的 Pubkey
    pub proposal: Pubkey,
    /// 要执行的指令内容
    pub instruction: InstructionData,
    /// 指令执行的时间戳（Unix 秒），未执行则为 None
    pub executed_at: Option<u64>,
    /// 指令当前执行状态
    pub execution_status: ExecutionStatus,
}


impl ProposalTransaction {
    /// - discriminator: 8字节
    /// - account_type: 1字节（GovernanceAccountType as u8）
    /// - proposal: 32字节（Pubkey）
    /// - executed_at: 9字节（Option<u64>，1字节tag + 8字节内容）
    /// - execution_status: 1字节（ExecutionStatus as u8）
    /// - instruction 字段序列化后的实际长度（可变长，需运行时单独计算）
    pub const FIXED_LEN: usize = 8 + 1 + 32 + 9 + 1;
    pub const SEED_PREFIX: &'static [u8] = b"proposal_transaction";
}
