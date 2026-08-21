# PDPA Malaysia Data Retention Guidelines

## Legal Basis

- **Tax Act 1967 (LHDN)**: Requires businesses to retain financial records for 7 years
- **PDPA 2010**: Governs personal data protection in Malaysia
- **Guideline**: Retain customer data for 7 years from date of service, then purge PII

## Retention Schedule

| Data Type           | Retention Period | Action After 7 Years                        |
| ------------------- | ---------------- | ------------------------------------------- |
| Invoices & receipts | 7 years          | Anonymize PII, retain financial totals      |
| Booking records     | 7 years          | Pseudonymize customer references            |
| Payment records     | 7 years          | Mask credit card, retain transaction IDs    |
| Correspondence      | 7 years          | Remove personal identifiers                 |
| Marketing consent   | 7 years          | Retain consent status, remove personal data |

## Database Purge Procedure

### Step 1: Archive (Run monthly)

```bash
node scripts/retain-purge.js --mode=archive --weeks=350
```

- Marks records older than 7 years for review
- Does NOT delete data
- Logs all records for audit trail

### Step 2: Review (Legal team)

- Review marked records for business necessity
- Determine which records can be safely purged
- Document retention decision

### Step 3: Purge (Run quarterly after archive)

```bash
node scripts/retain-purge.js --mode=purge --weeks=365*7 --confirm
```

- Permanently deletes archived records
- Requires `--confirm` flag
- Logs all deleted records

### Step 4: Verify

- Run count queries to verify deletion
- Verify no PII remains in production tables
- Update compliance dashboard

## S3 Storage Guidelines

### Bucket Configuration

- **Bucket name**: `leish-files`
- **Encryption**: SSE-KMS with alias `leish/s3-key`
- **Folder structure**:
  - `invoices/YYYY/MM/`
  - `receipts/YYYY/MM/`
  - `correspondence/YYYY/MM/`

### Retention

- Store invoices for 7 years
- Delete older invoices per the purge schedule
- Maintain audit logs of all deletions

## Code Implementation Guidelines

### 1. Data Minimization

- Never store full credit card numbers in application databases
- Mask phone numbers and emails in all logs
- Use `maskEmail()` and `maskPhone()` helpers

### 2. Retention Flags

- Add `retention_expiry` column to critical tables
- Index on `retention_expiry` for purge queries
- Soft-delete before hard-delete (archive → purge)

### 3. Audit Logging

- Log all data retention operations
- Include: timestamp, user, operation type, record count
- Store logs in immutable storage for 7 years

### 4. Exception Handling

- Legal hold exceptions: never purge during active litigation
- Minors' data: retain until age of majority + 7 years
- Commercial contracts: retain per contract terms, min 7 years

## Compliance Checklist

- [ ] 7-year retention schedule documented
- [ ] Archive/purge scripts implemented and tested
- [ ] S3 bucket configured with SSE-KMS
- [ ] Data masking applied to all PII
- [ ] Audit logging enabled
- [ ] Legal review completed
- [ ] Annual compliance review scheduled
