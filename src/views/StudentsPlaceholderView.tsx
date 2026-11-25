import React from 'react';
import { GraduationCap, Clock } from 'lucide-react';
import { Card, Badge } from '../components/Card';

export const StudentsPlaceholderView: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Student Management</h1>
          <p className="text-xs text-slate-500 mt-1">
            Student Profiles, Admission Validation, Notes & Family Links
          </p>
        </div>
        <Badge variant="neutral">Reserved for Stage 06</Badge>
      </div>

      <Card className="py-16 text-center flex flex-col items-center justify-center">
        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 mb-4">
          <GraduationCap className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-semibold text-slate-900">Module Pending Stage 06</h3>
        <p className="text-xs text-slate-500 max-w-md mt-1 mb-4">
          Student registration, unique admission numbering, searchable listings, server-side pagination, 
          and student-specific notes will be activated in Stage 06 after Stage 02 schema creation.
        </p>
        <div className="flex items-center space-x-2 text-xs text-slate-400">
          <Clock className="w-3.5 h-3.5" />
          <span>Stage 01 Foundation Ready</span>
        </div>
      </Card>
    </div>
  );
};
