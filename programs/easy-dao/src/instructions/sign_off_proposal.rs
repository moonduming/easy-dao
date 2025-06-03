use anchor_lang::prelude::*;

use crate::{
    error::GovernanceError, 
    Governance, 
    Proposal, 
    Realm, 
    SignatoryRecord, 
    TokenOwnerRecord, 
    ProposalState
};


#[derive(Accounts)]
pub struct SignOffProposal<'info> {
    pub signatory: Signer<'info>,
    pub realm: Account<'info, Realm>,
    #[account(
        has_one = realm @ GovernanceError::InvalidGovernanceRealm
    )]
    pub governance: Account<'info, Governance>,

    #[account(
        mut,
        has_one = governance @ GovernanceError::InvalidProposalGovernance
    )]
    pub proposal: Account<'info, Proposal>,

    #[account(
        mut,
        constraint = token_owner_record.governing_token_owner == signatory.key() 
            @ GovernanceError::InvalidProposalTokenOwnerRecord
    )]
    pub token_owner_record: Option<Account<'info, TokenOwnerRecord>>,

    #[account(
        mut,
        has_one = proposal @ GovernanceError::InvalidProposalGovernance,
        has_one = signatory @ GovernanceError::InvalidRequiredSignatory,
    )]
    pub signatory_record: Option<Account<'info, SignatoryRecord>>,
}


impl<'info> SignOffProposal<'info> {
    pub fn process(&mut self) -> Result<()> {
        if self.proposal.signatories_count > 0 
            && self.proposal.signatories_count < self.governance.required_signatories_count 
        {
            return err!(GovernanceError::MissingRequiredSignatory);
        }

        if self.proposal.signatories_count == 0 {
            let _tor = self.token_owner_record
                .as_deref()
                .ok_or(GovernanceError::MissingRequiredSignatory)?;

            self.proposal.signing_off_at = Some(Clock::get()?.unix_timestamp.try_into().unwrap());
        } else {
            let sr = self.signatory_record
                .as_deref_mut()
                .ok_or(GovernanceError::MissingRequiredSignatory)?;

            if sr.signed_off {
                return err!(GovernanceError::ProposalAlreadySignedOff);
            }

            sr.signed_off = true;

            if self.proposal.signatories_signed_off_count == 0 {
                self.proposal.signing_off_at = Some(Clock::get()?.unix_timestamp.try_into().unwrap());
                self.proposal.state = ProposalState::SigningOff;
            }
            self.proposal.signatories_signed_off_count = self.proposal
                .signatories_signed_off_count
                .checked_add(1)
                .ok_or(GovernanceError::Overflow)?;
        }

        if self.proposal.signatories_signed_off_count == self.proposal.signatories_count {
            self.proposal.state = ProposalState::Voting;
        }

        Ok(())
    }
}
