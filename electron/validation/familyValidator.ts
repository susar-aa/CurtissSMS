export interface IFamilyMemberInput {
  relationship_type: 'Father' | 'Mother' | 'Guardian';
  name: string;
  contact_number?: string | null;
  whatsapp_number?: string | null;
  occupation_id?: number | null;
}

export interface IFeePaymentValidationInput {
  annualFeeAmount: number;
  paymentAmount: number;
  paymentMethod: string;
}

export class FamilyAndFinancialValidator {
  /**
   * Validates parent/guardian rules:
   * - Father and Mother are optional individually, but AT LEAST ONE must exist.
   * - Guardian is optional.
   * - Maximum one Father, one Mother, and one Guardian.
   * - Contact numbers must be exactly 10 digits if provided.
   */
  public static validateFamilyMembers(members: IFamilyMemberInput[]): { isValid: boolean; error?: string } {
    if (!Array.isArray(members) || members.length === 0) {
      return { isValid: false, error: 'At least one parent (Father or Mother) must be provided.' };
    }

    let fatherCount = 0;
    let motherCount = 0;
    let guardianCount = 0;

    for (const member of members) {
      if (!member.name || member.name.trim().length === 0) {
        return { isValid: false, error: `Parent/Guardian name is required for ${member.relationship_type}.` };
      }

      if (member.relationship_type === 'Father') fatherCount++;
      else if (member.relationship_type === 'Mother') motherCount++;
      else if (member.relationship_type === 'Guardian') guardianCount++;
      else {
        return { isValid: false, error: `Invalid relationship type: ${member.relationship_type}` };
      }

      // 10-digit contact number validation if provided
      if (member.contact_number) {
        const contact = member.contact_number.trim();
        if (!/^\d{10}$/.test(contact)) {
          return { isValid: false, error: `Contact number for ${member.relationship_type} must be exactly 10 digits.` };
        }
      }

      if (member.whatsapp_number) {
        const whatsapp = member.whatsapp_number.trim();
        if (!/^\d{10}$/.test(whatsapp)) {
          return { isValid: false, error: `WhatsApp number for ${member.relationship_type} must be exactly 10 digits.` };
        }
      }
    }

    if (fatherCount > 1) {
      return { isValid: false, error: 'A family cannot have more than one Father record.' };
    }
    if (motherCount > 1) {
      return { isValid: false, error: 'A family cannot have more than one Mother record.' };
    }
    if (guardianCount > 1) {
      return { isValid: false, error: 'A family cannot have more than one Guardian record.' };
    }

    if (fatherCount === 0 && motherCount === 0) {
      return { isValid: false, error: 'At least one of Father or Mother is required for student registration.' };
    }

    return { isValid: true };
  }

  /**
   * Validates full cash payment rules:
   * - Whole-rupee integer amounts only.
   * - Payment amount must strictly match the annual fee amount.
   * - Cash payment method only.
   */
  public static validateFullCashPayment(input: IFeePaymentValidationInput): { isValid: boolean; error?: string } {
    const { annualFeeAmount, paymentAmount, paymentMethod } = input;

    if (!Number.isInteger(annualFeeAmount) || annualFeeAmount <= 0) {
      return { isValid: false, error: 'Annual fee must be a positive whole-rupee integer.' };
    }

    if (!Number.isInteger(paymentAmount) || paymentAmount <= 0) {
      return { isValid: false, error: 'Payment amount must be a positive whole-rupee integer.' };
    }

    if (paymentMethod !== 'Cash') {
      return { isValid: false, error: 'Only Cash payments are accepted for School Development & Facility Fees.' };
    }

    if (paymentAmount !== annualFeeAmount) {
      return { 
        isValid: false, 
        error: `Full payment required: Payment amount (LKR ${paymentAmount}) does not equal the annual fee amount (LKR ${annualFeeAmount}).` 
      };
    }

    return { isValid: true };
  }
}
