GMF Form - Vercel Deployment (Serverless)
----------------------------------------
This project is prepared for deployment on Vercel (serverless functions).

Steps to deploy:
1. Place your GMF PDF template into the /template folder and rename it to:
   Form-GMF-Q-063M-template.pdf
2. Zip and upload this project to Vercel (or connect to GitHub and push).
3. In Vercel dashboard set Environment Variables (Project > Settings > Environment Variables):
   - SMTP_HOST
   - SMTP_PORT
   - SMTP_SECURE (true or false)
   - SMTP_USER
   - SMTP_PASS
   - PDF_TEMPLATE (optional, default path: ./template/Form-GMF-Q-063M-template.pdf)
4. Deploy. After deploy, open the public URL and test the form.

Notes:
- The serverless function writes temporary files to /tmp; these are ephemeral and removed by the platform.
- Generated PDF is attached and emailed to the submitter's email. A temporary copy is also created so admins can download it from logs if needed.
- For production email sending, replace the dummy SMTP with your SMTP provider (Gmail App Password, SendGrid, AWS SES, etc.).
- If you need exact 1:1 overlay alignment on the PDF template, you will need to fine tune coordinates in api/submit.js
