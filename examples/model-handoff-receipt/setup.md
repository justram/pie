---
schema: setup-schema.json
model: google-antigravity/gemini-3-flash
---
Extract structured data from the receipt image.
Rules:
- Use currency USD.
- Parse quantities and prices as numbers.
- Ensure arithmetic is consistent:
  - lineItems[i].total = quantity * unitPrice
  - subtotal = sum(lineItems.total)
  - total = subtotal + tax
- If validation feedback indicates a mismatch, correct the numbers to satisfy the constraints.
