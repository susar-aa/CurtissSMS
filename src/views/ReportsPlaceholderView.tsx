import React from 'react';
import { FileText, Clock } from 'lucide-react';
import { Card, Badge } from '../components/Card';

export const ReportsPlaceholderView: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Reports & Student Printing</h1>
          <p className="text-xs text-slate-500 mt-1">
            Two-Page A4 Student Profile & Fee Ledger Documents
          </p>
        </div>
        <Badge variant="neutral">Reserved for Stage 12</Badge>
      </div>

      <Card className="py-16 text-center flex flex-col items-center justify-center">
        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 mb-4">
          <FileText className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-semibold text-slate-900">Module Pending Stage 12</h3>
        <p className="text-xs text-slate-500 max-w-md mt-1 mb-4">
          Official 2-page A4 printable templates with school logo, sibling references, student profile,
          and fee register history will be finalized in Stage 12.
        </p>
        <div className="flex items-center space-x-2 text-xs text-slate-400">
          <Clock className="w-3.5 h-3.5" />
          <span>Stage 01 Foundation Ready</span>
        </div>
      </Card>
    </div>
  );
};
