import React from 'react';
import ProposalList from './ProposalList';
import CreateProposal from './CreateProposal';

const ProposalManager: React.FC = () => (
  <div className="card proposal-manager">
    <h2 className="pm-title">提案管理</h2>
    <div className="pm-body">
      <ProposalList />
      <CreateProposal />
    </div>
  </div>
);

export default ProposalManager;