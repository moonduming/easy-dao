use anchor_lang::prelude::*;

use crate::{error::GovernanceError, ExecutionStatus, GovernanceAccountType, InstructionData, Proposal, ProposalState, ProposalTransaction, TokenOwnerRecord};


#[derive(Accounts)]
#[instruction(instruction_data: InstructionData)]
pub struct AddTransaction<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        constraint = token_owner_record.governing_token_owner == authority.key() 
            @ GovernanceError::InvalidTokenOwnerRecordOwner,
    )]
    pub token_owner_record: Account<'info, TokenOwnerRecord>,
    
    #[account(
        mut,
        has_one = token_owner_record @ GovernanceError::InvalidTokenOwnerRecordOwner,
    )]
    pub proposal: Account<'info, Proposal>,

    #[account(
        init,
        payer = authority,
        space = ProposalTransaction::FIXED_LEN 
            + instruction_data.serialized_len(),
        seeds = [
            ProposalTransaction::SEED_PREFIX,
            proposal.key().as_ref(),
        ],
        bump,
    )]
    pub proposal_transaction: Account<'info, ProposalTransaction>,

    pub system_program: Program<'info, System>,
}

impl<'info> AddTransaction<'info> {
    pub fn process(
        &mut self, 
        instruction_data: InstructionData
    ) -> Result<()> {
        require!(
            self.proposal.state == ProposalState::Draft, 
            GovernanceError::InvalidProposalState
        );

        require!(!self.proposal.has_transaction, GovernanceError::TransactionAlreadyExists);
        
        self.proposal.has_transaction = true;

        self.proposal_transaction.account_type = GovernanceAccountType::ProposalTransaction;
        self.proposal_transaction.proposal = self.proposal.key();
        self.proposal_transaction.instruction = instruction_data;
        self.proposal_transaction.executed_at = None;
        self.proposal_transaction.execution_status = ExecutionStatus::Pending;
        
        Ok(())
    }
}