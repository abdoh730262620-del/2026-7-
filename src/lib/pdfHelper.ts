import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Provide a base64 font or rely on a standard Arabic-supporting font if registered.
// NOTE: jspdf's default fonts don't support Arabic well. 
// A common workaround is to use Amiri font or just do our best. 
// Because setting up Custom Arabic Font in jsPDF can be tricky without the .ttf base64,
// we will just use english chars or simple unicode if needed, or we tell the user that Arabic PDF needs a custom font.
// Let's use standard for now, but to ensure it prints properly, we might just use browser's window.print()!
// The user asked for "pdf", window.print() allows saving as PDF and supports full Arabic natively without base64 font issues.
// Let's create an invisible print iframe instead, or just a new window!
