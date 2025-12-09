import mongoose from 'mongoose';

const CarInvestmentEntrySchema = new mongoose.Schema({
  carname: { type: String, required: true },
  carOwnerName: { type: String },
  investorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Investor' },
  investorMobile: { type: String },
  carvalue: { type: Number, required: true },
   MonthlyPayout: { type: Number, required: true },
   deductionTDS: { type: Number, required: true },
  finalMonthlyPayout: { type: Number },
  features: { type: [String], default: [] },
  active: { type: Boolean, default: true },
}, { timestamps: true, collection: 'carinvestmententries' });

// Auto-calculate finalMonthlyPayout before saving
CarInvestmentEntrySchema.pre('save', function(next) {
  if (this.MonthlyPayout && this.deductionTDS !== undefined) {
    const tdsAmount = (this.MonthlyPayout * this.deductionTDS) / 100;
    this.finalMonthlyPayout = this.MonthlyPayout - tdsAmount;
  }
  next();
});

// Also calculate on findOneAndUpdate
CarInvestmentEntrySchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate();
  if (update.MonthlyPayout !== undefined || update.deductionTDS !== undefined) {
    const monthlyPayout = update.MonthlyPayout || update.$set?.MonthlyPayout;
    const deductionTDS = update.deductionTDS !== undefined ? update.deductionTDS : update.$set?.deductionTDS;
    
    if (monthlyPayout !== undefined && deductionTDS !== undefined) {
      const tdsAmount = (monthlyPayout * deductionTDS) / 100;
      const finalPayout = monthlyPayout - tdsAmount;
      
      if (update.$set) {
        update.$set.finalMonthlyPayout = finalPayout;
      } else {
        update.finalMonthlyPayout = finalPayout;
      }
    }
  }
  next();
});

// Clear any cached model to prevent schema conflicts
if (mongoose.models.CarInvestmentEntry) {
  delete mongoose.models.CarInvestmentEntry;
}

export default mongoose.model('CarInvestmentEntry', CarInvestmentEntrySchema);
