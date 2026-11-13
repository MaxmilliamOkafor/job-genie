// The website shows each education entry with its graduation year only, the
// same rule the CV and the PDF/Word files follow. One shared helper so the
// Profile page and the documents cannot disagree. Stored dates are untouched.
export { educationDisplayDate, educationDisplayLine, yearOnlyText } from '../../supabase/functions/_shared/educationDates';
