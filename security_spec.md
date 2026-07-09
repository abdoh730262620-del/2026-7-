# Security Spec
## Data Invariants
1. Users must have a role.
2. Invoices payment type must be valid.
3. Cash transactions must be positive amounts.

## Dirty Dozen Payloads
1. Create user with missing role.
2. Update user to admin.
3. Negative cash amount.
4. Delete sales invoice.
5. Missing createdBy.
