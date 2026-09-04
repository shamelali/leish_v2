# PDFs — Leish! v2 Requirements (Generated)

All PDFs generated from `docs/00-09-*.md` via `pandoc 3.1.3` + `weasyprint 69.0` with custom brand CSS (`#c9284b`), A4, TOC, header/footer, page numbers.

| PDF                                                | Pages   | Source                          | Description                                   |
| -------------------------------------------------- | ------- | ------------------------------- | --------------------------------------------- |
| `00-Requirements-Index.pdf`                        | 4       | `docs/00-Requirements-Index.md` | Master index & reading paths                  |
| `01-BRS-Business-Requirements-Specification.pdf`   | 18      | `docs/01-BRS-...md`             | Business Requirements (BR-01..32, BRL-01..15) |
| `02-SRS-Software-Requirements-Specification.pdf`   | 21      | `docs/02-SRS-...md`             | IEEE 830 SRS (SRS-F-01..13, interfaces)       |
| `03-FRS-Functional-Requirements-Specification.pdf` | 31      | `docs/03-FRS-...md`             | 48 FR-xxx with acceptance criteria            |
| `04-NFR-Non-Functional-Requirements.pdf`           | 12      | `docs/04-NFR-...md`             | Performance, security, reliability NFRs       |
| `05-Use-Cases-and-User-Stories.pdf`                | 16      | `docs/05-Use-Cases-...md`       | 20 UC + 24 US                                 |
| `06-Data-Model-and-ERD.pdf`                        | 15      | `docs/06-Data-Model-...md`      | ERD + 13 table dictionaries                   |
| `07-API-Specification.pdf`                         | 20      | `docs/07-API-...md`             | 40+ endpoints                                 |
| `08-Traceability-Matrix.pdf`                       | 8       | `docs/08-Traceability-...md`    | BR→SRS→FRS→API→DB→test                        |
| `09-Glossary.pdf`                                  | 4       | `docs/09-Glossary.md`           | Terminology                                   |
| **`Leish-v2-Complete-Specification.pdf`**          | **149** | _Merged via `pypdf`_            | **Single-file complete spec (all 10 above)**  |

**Branding**: Leish! gradient header, `Inter` type, rose `#c9284b` accents, confidential footer, page x of y.

**Regenerate**:

```bash
# Single file
pandoc docs/01-BRS-*.md -o docs/pdf/01-BRS-*.pdf --pdf-engine=weasyprint --css=/tmp/leish-pdf.css --toc --toc-depth=3

# All (requires pandoc + weasyprint + pypdf)
bash /tmp/build_pdfs.sh
```

**Page size**: A4, margins 22/18mm, print-color-adjust exact.
