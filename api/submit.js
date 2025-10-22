// IMPORT & SETUP
import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import os from "os";
import { PDFDocument, StandardFonts } from "pdf-lib";
import formidable from "formidable";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config();
console.log("ENV SMTP HOST:", process.env.SMTP_HOST);

// HANDLER MULAI
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const form = formidable({ multiples: true, keepExtensions: true });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error("❌ Form parse error:", err);
      return res.status(400).json({ error: "Form parse error" });
    }

    try {
      console.log("✅ Form parsed successfully:", fields);

      // AMBIL SEMUA FIELD DARI FORM HTML
      const requestChoice = fields.requestChoice?.[0] || "";
      const name = fields.name?.[0] || "";
      const id = fields.id?.[0] || "";
      const unit = fields.unit?.[0] || "";
      const jobTitle = fields.jobTitle?.[0] || "";
      const additionalInfo = fields.additionalInfo?.[0] || "";
      const email = fields.email?.[0] || "";

      // Tambahan field baru (Division Head, User, QA)
      const divisionHeadName = fields.divisionHeadName?.[0] || "";
      const divisionHeadDate = fields.divisionHeadDate?.[0] || "";
      const userName = fields.userName?.[0] || "";
      const userDate = fields.userDate?.[0] || "";
      const qaName = fields.qaName?.[0] || "";
      const qaDate = fields.qaDate?.[0] || "";

      if (!email) {
        return res.status(400).json({ error: "Email required" });
      }

      // AMBIL SEMUA FILE (LICENSE, CV, TTD, DLL)
      const divisionHeadSign = files.divisionHeadSign
        ? Array.isArray(files.divisionHeadSign)
          ? files.divisionHeadSign[0]
          : files.divisionHeadSign
        : null;
      const userSign = files.userSign
        ? Array.isArray(files.userSign)
          ? files.userSign[0]
          : files.userSign
        : null;
      const qaSign = files.qaSign
        ? Array.isArray(files.qaSign)
          ? files.qaSign[0]
          : files.qaSign
        : null;

      // BUKA TEMPLATE PDF
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const templatePath =
        process.env.PDF_TEMPLATE ||
        path.join(__dirname, "..", "template", "Form-GMF-Q-063M-template.pdf");

      if (!fs.existsSync(templatePath)) {
        console.error("Template PDF not found at", templatePath);
        return res.status(500).json({ error: "Template PDF not found" });
      }

      const existingPdfBytes = fs.readFileSync(templatePath);
      const pdfDoc = await PDFDocument.load(existingPdfBytes);
      const form = pdfDoc.getForm();
      const page = pdfDoc.getPages()[0];

      // ISI FIELD TEXT DI PDF
      form.getTextField("name").setText(name);
      form.getTextField("id").setText(id);
      form.getTextField("unit").setText(unit);
      form.getTextField("jobTitle").setText(jobTitle);
      form.getTextField("additionalInfo").setText(additionalInfo || "-");

      form.getTextField("divisionHeadName")?.setText(divisionHeadName);
      form.getTextField("divisionHeadDate")?.setText(divisionHeadDate);
      form.getTextField("userName")?.setText(userName);
      form.getTextField("userDate")?.setText(userDate);
      form.getTextField("qaName")?.setText(qaName);
      form.getTextField("qaDate")?.setText(qaDate);

      // TAMBAHKAN GAMBAR (TANDA TANGAN)
      async function embedImage(pdfDoc, filePath) {
        const imgBytes = fs.readFileSync(filePath);
        const ext = path.extname(filePath).toLowerCase();

        if (ext === ".png") {
          return await pdfDoc.embedPng(imgBytes);
        } else if (ext === ".jpg" || ext === ".jpeg") {
          return await pdfDoc.embedJpg(imgBytes);
        } else {
          throw new Error(
            "File tanda tangan harus berupa PNG, JPG, atau JPEG."
          );
        }
      }

      // Division Head signature
      if (divisionHeadSign?.filepath) {
        try {
          const sigImg = await embedImage(pdfDoc, divisionHeadSign.filepath);
          const field = form.getButton("divisionHeadSign");
          field.setImage(sigImg);
        } catch (err) {
          console.error("❌ Error division head sign:", err.message);
        }
      }

      // User signature
      if (userSign?.filepath) {
        try {
          const sigImg = await embedImage(pdfDoc, userSign.filepath);
          const field = form.getButton("userSign");
          field.setImage(sigImg);
        } catch (err) {
          console.error("❌ Error user sign:", err.message);
        }
      }

      // QA signature
      if (qaSign?.filepath) {
        try {
          const sigImg = await embedImage(pdfDoc, qaSign.filepath);
          const field = form.getButton("qaSign");
          field.setImage(sigImg);
        } catch (err) {
          console.error("❌ Error QA sign:", err.message);
        }
      }

      // CENTANG CHECKBOX
      // Mapping antara pilihan request dan nama field checkbox di PDF
      // CENTANG CHECKBOX / RADIO GROUP
      const checkboxMapping = {
        "initial-stamp": "CheckBox1",
        "initial-coc": "CheckBox2",
        "renewal-coc": "CheckBox3",
        "change-rating": "CheckBox4",
      };

      const checkboxFieldName = checkboxMapping[requestChoice];
      if (checkboxFieldName) {
        try {
          // Coba ambil grup bernama "Request"
          const group = form.getRadioGroup("Request");
          group.select(checkboxFieldName);
          console.log(`✅ Selected ${checkboxFieldName} in group "Request"`);
        } catch (err1) {
          try {
            // Jika bukan grup, fallback ke checkbox individu
            const checkbox = form.getCheckBox(checkboxFieldName);
            checkbox.check();
            console.log(`✅ Checked ${checkboxFieldName} individually`);
          } catch (err2) {
            console.log(
              "⚠️ Checkbox/Radio field not found:",
              checkboxFieldName
            );
          }
        }
      } else {
        console.log("⚠️ No mapping for requestChoice:", requestChoice);
      }

      // SIMPAN PDF HASIL
      form.flatten(); // kunci field
      const pdfBytes = await pdfDoc.save();
      const outName = `GMF-Form-Q-063M-${(name || "no-name").replace(
        /\s+/g,
        "_"
      )}-${Date.now()}.pdf`;
      const outPath = path.join(os.tmpdir(), outName);
      fs.writeFileSync(outPath, pdfBytes);

      // KIRIM EMAIL
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT),
        secure: process.env.SMTP_SECURE === "true", // false untuk STARTTLS
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      const attachments = [{ filename: outName, path: outPath }];

      // Tambahkan semua file ke attachment
      ["license", "cv", "authLetter"].forEach((k) => {
        const f = files[k];
        const fileObj = Array.isArray(f) ? f[0] : f;
        if (fileObj && fileObj.filepath) {
          attachments.push({
            filename:
              fileObj.originalFilename || path.basename(fileObj.filepath),
            path: fileObj.filepath,
          });
        }
      });

      await transporter.sendMail({
        from: '"GMF AeroAsia" <hafizhmff@gmail.com>',
        to: email,
        replyTo: process.env.SMTP_USER,
        subject: `Your GMF Q-063M Submission - ${name}`,
        text: `Dear ${name},\n\nThank you for submitting!\n\nRegards,\nGMF AeroAsia`,
        attachments,
      });

      console.log(`✅ Email sent successfully to ${email}`);
      return res.json({
        ok: true,
        message: "Form processed and email sent",
        pdf: outName,
      });
    } catch (err) {
      console.error("❌ Processing error:", err);
      return res.status(500).json({ error: String(err) });
    }
  });
}
