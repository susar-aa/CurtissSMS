import React from 'react';
import { CreditCard, Clock } from 'lucide-react';
import { Card, Badge } from '../components/Card';

export const FeesPlaceholderView: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            School Development & Facility Fees
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Annual Fee Generation, Cash Recording, Receipts & Ledger
          </p>
        </div>
        <Badge variant="neutral">Reserved for Stages 10 & 11</Badge>
      </div>

      <Card className="py-16 text-center flex flex-col items-center justify-center">
        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 mb-4">
          <CreditCard className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-semibold text-slate-900">Module Pending Stage 10 & 11</h3>
        <p className="text-xs text-slate-500 max-w-md mt-1 mb-4">
          Annual fee configuration, cash-only payment processing, printable receipts, and duplicate-prevention
          rules will be implemented in subsequent phases.
        </p>
        <div className="flex items-center space-x-2 text-xs text-slate-400">
          <Clock className="w-3.5 h-3.5" />
          <span>Stage 01 Foundation Ready</span>
        </div>
      </Card>
    </div>
  );
};
