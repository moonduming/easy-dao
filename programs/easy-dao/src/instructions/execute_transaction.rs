use anchor_lang::{
    prelude::*, 
    solana_program::{instruction::Instruction, program::invoke}
};
use crate::{
    error::GovernanceError, 
    ExecutionStatus, 
    Governance, 
    Proposal, 
    ProposalState, 
    ProposalTransaction
};


#[derive(Accounts)]
pub struct ExecuteTransaction<'info> {
    pub governance: Account<'info, Governance>,

    #[account(
        mut,
        has_one = governance @ GovernanceError::InvalidGovernanceForAccount,
    )]
    pub proposal: Account<'info, Proposal>,

    #[account(
        mut,
        has_one = proposal @ GovernanceError::InvalidProposalForTransaction,
    )]
    pub proposal_transaction: Account<'info, ProposalTransaction>,
}


pub fn process_execute_transaction(
    ctx: Context<ExecuteTransaction>
) -> Result<()> {
    let proposal = &mut ctx.accounts.proposal;
    let proposal_transaction = &mut ctx.accounts.proposal_transaction;

    require!(
        proposal.state == ProposalState::Executing, 
        GovernanceError::InvalidStateCannotExecuteTransaction
    );

    if proposal_transaction.executed_at.is_some() {
        return err!(GovernanceError::TransactionAlreadyExecuted);
    }

    // 执行指令
    let ix = Instruction {
        program_id: proposal_transaction.instruction.program_id,
        accounts: proposal_transaction
            .instruction
            .accounts
            .iter().map(|m| AccountMeta {
                pubkey: m.pubkey,
                is_signer: m.is_signer,
                is_writable: m.is_writable,
            })
            .collect(),
        data: proposal_transaction.instruction.data.clone(),
    };

    require!(
        ctx.remaining_accounts.len() == ix.accounts.len(),
        GovernanceError::InvalidInstructionAccounts,
    );

    // 先尝试执行指令，记录成功或失败
    let result = invoke(&ix, ctx.remaining_accounts);
    let now = Clock::get()?.unix_timestamp.try_into()?;

    match result {
        Ok(_) => {
            proposal_transaction.execution_status = ExecutionStatus::Success;
        }
        Err(e) => {
            proposal_transaction.execution_status = ExecutionStatus::Error;
            msg!("Transaction execution failed: {}", e);
        }
    }

    proposal_transaction.executed_at = Some(now);
    
    proposal.state = ProposalState::Completed;
    proposal.closed_at = Some(now);
   
    Ok(())
}
