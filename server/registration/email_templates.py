"""Branded HTML email templates for TSAE (table layout, inline CSS for clients)."""
from __future__ import annotations

import html
import re
from typing import Any

SITE_URL = "https://www.tsae.asia"
LOGO_URL = f"{SITE_URL}/images/logo/logo-tsae.png"

# TSAE brand palette (matches tsae.asia / admin theme)
C_GREEN_DARK = "#0f5a30"
C_GREEN = "#1a6b3a"
C_GREEN_LIGHT = "#1a7a42"
C_GOLD = "#c8a951"
C_BG = "#f4f6f5"
C_CARD = "#ffffff"
C_TEXT = "#0f1f17"
C_MUTED = "#5a6b61"
C_BORDER = "#e7ede9"

EMAIL_TEMPLATES: dict[str, dict[str, str]] = {
    "invite": {
        "label": "เชิญอัปเดตข้อมูลสมาชิก",
        "subject": "TSAE — กรุณาอัปเดตข้อมูลสมาชิกของท่าน",
    },
    "renewal": {
        "label": "แจ้งต่ออายุสมาชิก",
        "subject": "TSAE — แจ้งต่ออายุสมาชิก / Membership Renewal",
    },
    "document": {
        "label": "แจ้งเอกสารจากสมาคม",
        "subject": "TSAE — มีเอกสารใหม่สำหรับท่าน",
    },
    "custom": {
        "label": "ข้อความกำหนดเอง",
        "subject": "TSAE — ข้อความจากสมาคมวิศวกรรมเกษตรแห่งประเทศไทย",
    },
}


def _esc(value: Any) -> str:
    return html.escape(str(value or ""), quote=True)


def _nl2br(text: str) -> str:
    return _esc(text).replace("\n", "<br>")


def _strip_tags(html_str: str) -> str:
    return re.sub(r"<[^>]+>", "", html_str).strip()


def _member_login_number(code: str) -> str:
    d = re.sub(r"\D", "", code or "")
    return d.lstrip("0") or d


def _login_field_hint(code: str, email: str) -> str:
    num = _member_login_number(code)
    opts = f"เลขสมาชิก <strong>{_esc(num)}</strong> หรือรหัสเต็ม <strong>{_esc(code)}</strong>"
    if email:
        opts += f" หรืออีเมล <strong>{_esc(email)}</strong>"
    return f"กรอก{opts} (อย่างใดอย่างหนึ่ง) + รหัสผ่าน"


def email_shell(
    *,
    preheader: str,
    title: str,
    body_html: str,
    cta_url: str = "",
    cta_label: str = "",
    member_code: str = "",
    site_url: str = SITE_URL,
) -> str:
    """Full branded email document."""
    code_chip = ""
    if member_code:
        code_chip = (
            f'<td align="right" style="vertical-align:middle">'
            f'<span style="display:inline-block;padding:6px 14px;background:rgba(255,255,255,.18);'
            f'border:1px solid rgba(255,255,255,.35);border-radius:999px;font-size:13px;'
            f'font-weight:700;color:#fff;letter-spacing:.3px">{_esc(member_code)}</span></td>'
        )
    cta_block = ""
    if cta_url and cta_label:
        cta_block = f"""
        <tr><td style="padding:8px 36px 28px">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="border-radius:12px;background:linear-gradient(135deg,{C_GREEN},{C_GREEN_LIGHT})">
              <a href="{_esc(cta_url)}" target="_blank"
                 style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;
                 color:#ffffff;text-decoration:none;letter-spacing:.2px">{_esc(cta_label)}</a>
            </td></tr>
          </table>
          <p style="margin:14px 0 0;font-size:12px;color:{C_MUTED};line-height:1.5">
            หากปุ่มไม่ทำงาน คัดลอกลิงก์นี้ไปวางในเบราว์เซอร์:<br>
            <a href="{_esc(cta_url)}" style="color:{C_GREEN};word-break:break-all">{_esc(cta_url)}</a>
          </p>
        </td></tr>"""

    return f"""<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>{_esc(title)}</title>
  <!--[if mso]><style>body,table,td{{font-family:Arial,Helvetica,sans-serif!important}}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:{C_BG};font-family:'Segoe UI',Tahoma,Arial,sans-serif;
  color:{C_TEXT};-webkit-text-size-adjust:100%">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">{_esc(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background:{C_BG};padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
             style="max-width:600px;width:100%;background:{C_CARD};border-radius:20px;
             overflow:hidden;box-shadow:0 8px 32px rgba(15,90,48,.08);border:1px solid {C_BORDER}">

        <!-- Header -->
        <tr><td style="background:linear-gradient(120deg,{C_GREEN_DARK} 0%,{C_GREEN} 55%,{C_GREEN_LIGHT} 100%);
            padding:28px 32px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="vertical-align:middle">
                <img src="{LOGO_URL}" alt="TSAE" width="52" height="52"
                     style="display:block;border-radius:12px;background:#fff;padding:4px">
              </td>
              <td style="padding-left:14px;vertical-align:middle">
                <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:1.2px;
                   text-transform:uppercase;color:rgba(255,255,255,.75)">Thai Society of Agricultural Engineering</p>
                <p style="margin:4px 0 0;font-size:17px;font-weight:800;color:#fff;line-height:1.3">
                  สมาคมวิศวกรรมเกษตรแห่งประเทศไทย</p>
              </td>
              {code_chip}
            </tr>
          </table>
        </tr>

        <!-- Gold accent -->
        <tr><td style="height:4px;background:linear-gradient(90deg,{C_GOLD},{C_GOLD} 40%,{C_GREEN_LIGHT})"></td></tr>

        <!-- Title -->
        <tr><td style="padding:32px 36px 8px">
          <h1 style="margin:0;font-size:22px;font-weight:800;color:{C_GREEN_DARK};line-height:1.35">{_esc(title)}</h1>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:12px 36px 8px;font-size:15px;line-height:1.75;color:{C_TEXT}">
          {body_html}
        </td></tr>

        {cta_block}

        <!-- Footer -->
        <tr><td style="padding:8px 36px 32px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="border-top:1px solid {C_BORDER};margin-top:8px">
            <tr><td style="padding-top:22px">
              <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:{C_GREEN_DARK}">ติดต่อสมาคม</p>
              <p style="margin:0;font-size:13px;line-height:1.7;color:{C_MUTED}">
                2143/1 อาคาร 5 ชั้น 5 กรมส่งเสริมการเกษตร ลาดยาว จตุจักร กรุงเทพฯ 10900<br>
                โทร. <a href="tel:+66818072458" style="color:{C_GREEN};text-decoration:none">081 807 2458</a>
                · <a href="mailto:center@tsae.asia" style="color:{C_GREEN};text-decoration:none">center@tsae.asia</a><br>
                <a href="{_esc(site_url)}" style="color:{C_GREEN};text-decoration:none">www.tsae.asia</a>
              </p>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="background:#f8faf9;padding:14px 36px;text-align:center;
            font-size:11px;color:#9aa8a0;line-height:1.5">
          © Thai Society of Agricultural Engineering (TSAE). All rights reserved.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _info_box(content_html: str) -> str:
    return (
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
        f'style="margin:18px 0;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px">'
        f'<tr><td style="padding:16px 18px;font-size:14px;line-height:1.7;color:{C_TEXT}">'
        f"{content_html}</td></tr></table>"
    )


def _credentials_box(code: str, email: str, password: str = "") -> str:
    login_num = _member_login_number(code)
    pwd_row = ""
    if password:
        pwd_row = (
            f'<tr><td style="padding:4px 0;color:{C_MUTED};width:120px">รหัสผ่าน</td>'
            f'<td style="padding:4px 0"><strong style="font-size:18px;color:{C_GREEN};'
            f'letter-spacing:1px;font-family:monospace">{_esc(password)}</strong></td></tr>'
        )
    return _info_box(
        f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">'
        f'<tr><td style="padding:4px 0;color:{C_MUTED};width:120px">รหัสสมาชิก</td>'
        f'<td style="padding:4px 0"><strong style="font-size:18px;color:{C_GREEN}">{_esc(code)}</strong></td></tr>'
        f'<tr><td style="padding:4px 0;color:{C_MUTED}">เลขเข้าระบบ</td>'
        f'<td style="padding:4px 0"><strong style="font-size:18px;color:{C_GREEN}">{_esc(login_num)}</strong>'
        f'<span style="font-size:12px;color:{C_MUTED}"> หรือ {_esc(code)}</span></td></tr>'
        f'<tr><td style="padding:4px 0;color:{C_MUTED}">อีเมล</td>'
        f'<td style="padding:4px 0"><strong>{_esc(email)}</strong></td></tr>'
        f"{pwd_row}"
        f"</table>"
        + (
            f'<p style="margin:12px 0 0;font-size:12px;color:{C_MUTED}">'
            f"เข้าสู่ระบบ: {_login_field_hint(code, email)} · แนะนำให้เปลี่ยนรหัสผ่านหลังเข้าครั้งแรก</p>"
            if password
            else f'<p style="margin:12px 0 0;font-size:12px;color:{C_MUTED}">{_login_field_hint(code, email)}</p>'
        )
    )


def _steps_list(items: list[str]) -> str:
    rows = "".join(
        f'<tr><td style="padding:6px 0;vertical-align:top;width:28px;font-weight:800;color:{C_GOLD}">{i}.</td>'
        f'<td style="padding:6px 0;font-size:14px;line-height:1.65;color:{C_TEXT}">{_esc(t)}</td></tr>'
        for i, t in enumerate(items, 1)
    )
    return (
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
        f'style="margin:16px 0">{rows}</table>'
    )


def render_member_email(
    template: str,
    *,
    name: str,
    code: str,
    email: str,
    login_url: str,
    site_url: str = SITE_URL,
    custom_body: str = "",
    custom_subject: str = "",
    password: str = "",
) -> tuple[str, str, str]:
    """Return (subject, html, plain_text)."""
    meta = EMAIL_TEMPLATES.get(template, EMAIL_TEMPLATES["custom"])
    subject = custom_subject.strip() or meta["subject"]
    salutation = f"เรียน {_esc(name)}"

    if template == "invite":
        body = f"""
        <p style="margin:0 0 14px">{salutation}</p>
        <p style="margin:0 0 14px">
          สมาคมวิศวกรรมเกษตรแห่งประเทศไทย (TSAE) ขอความกรุณาท่าน
          <strong>ตรวจสอบและอัปเดตข้อมูลสมาชิก</strong> ให้ถูกต้องครบถ้วน
          เพื่อการติดต่อสื่อสารและบริการสมาชิกที่สมบูรณ์
        </p>
        {_credentials_box(code, email, password)}
        <p style="margin:0 0 8px;font-weight:700;color:{C_GREEN_DARK}">ท่านสามารถทำได้ดังนี้</p>
        {_steps_list([
            f"เข้าสู่ระบบด้วยเลขสมาชิก {_member_login_number(code)} หรืออีเมล {email} (อย่างใดอย่างหนึ่ง) + รหัสผ่านด้านบน",
            "ตรวจสอบ แก้ไขข้อมูลติดต่อ (อีเมล โทรศัพท์ ที่อยู่)",
            "เปลี่ยนรหัสผ่านได้จากหน้าข้อมูลสมาชิก (แนะนำหลังเข้าครั้งแรก)",
            "แนบหลักฐานการชำระเงิน หรือเอกสารที่เกี่ยวข้อง (ถ้ามี)",
            "ดาวน์โหลดเอกสารจากสมาคมที่จัดไว้ให้ท่าน",
        ])}
        <p style="margin:14px 0 0;font-size:13px;color:{C_MUTED}">
          หากลืมรหัสผ่าน ใช้เมนู 「ลืมรหัสผ่าน」 ที่หน้าเข้าสู่ระบบ ระบบจะส่งรหัสผ่านใหม่ไปที่อีเมลนี้
        </p>"""
        html_out = email_shell(
            preheader=f"อัปเดตข้อมูลสมาชิก TSAE — รหัส {code}",
            title="กรุณาอัปเดตข้อมูลสมาชิก",
            body_html=body,
            cta_url=login_url,
            cta_label="เข้าสู่ระบบสมาชิก →",
            member_code=code,
            site_url=site_url,
        )
        plain = _plain_invite(name, code, email, login_url, password)

    elif template == "renewal":
        body = f"""
        <p style="margin:0 0 14px">{salutation}</p>
        <p style="margin:0 0 14px">
          สมาคมวิศวกรรมเกษตรแห่งประเทศไทย (TSAE) ขอแจ้งให้ทราบว่า
          <strong>ใกล้ถึงกำหนดต่ออายุสมาชิก</strong> ของท่าน
          กรุณาดำเนินการต่ออายุและแนบหลักฐานการชำระเงินผ่านระบบออนไลน์
        </p>
        {_credentials_box(code, email, password)}
        {_steps_list([
            f"เข้าสู่ระบบด้วยเลขสมาชิก {_member_login_number(code)} หรืออีเมล {email} (อย่างใดอย่างหนึ่ง) + รหัสผ่าน",
            "อัปโหลดหลักฐานการชำระค่าบำรุงสมาชิก",
            "ตรวจสอบข้อมูลติดต่อให้เป็นปัจจุบัน",
        ])}
        <p style="margin:14px 0 0;font-size:13px;color:{C_MUTED}">
          รายละเอียดค่าบำรุงสมาชิกดูได้ที่
          <a href="{_esc(site_url)}/th/membership/" style="color:{C_GREEN}">หน้าสมาชิก TSAE</a>
        </p>"""
        html_out = email_shell(
            preheader=f"แจ้งต่ออายุสมาชิก TSAE — รหัส {code}",
            title="แจ้งต่ออายุสมาชิก",
            body_html=body,
            cta_url=login_url,
            cta_label="ต่ออายุสมาชิกออนไลน์ →",
            member_code=code,
            site_url=site_url,
        )
        plain = (
            f"เรียน {name}\n\n"
            f"TSAE ขอแจ้งให้ทราบว่าใกล้ถึงกำหนดต่ออายุสมาชิก\n"
            f"รหัสสมาชิก: {code}\n"
            f"เลขเข้าระบบ: {_member_login_number(code)}\n"
            f"อีเมล: {email}\n\n"
            f"เข้าสู่ระบบ: กรอกเลขสมาชิก {_member_login_number(code)} หรืออีเมล {email} + รหัสผ่าน\n"
            f"{login_url}\n\n"
            f"— TSAE · center@tsae.asia · {site_url}"
        )

    elif template == "document":
        body = f"""
        <p style="margin:0 0 14px">{salutation}</p>
        <p style="margin:0 0 14px">
          สมาคมวิศวกรรมเกษตรแห่งประเทศไทย (TSAE) ได้จัดเตรียม
          <strong>เอกสารสำหรับสมาชิก</strong> ไว้ให้ท่านแล้ว
          กรุณาเข้าสู่ระบบเพื่อดาวน์โหลดเอกสารจากสมาคม
        </p>
        {_credentials_box(code, email)}
        <p style="margin:0;font-size:14px;line-height:1.7">
          {_login_field_hint(code, email)}
          หากลืมรหัสผ่าน กด 「ลืมรหัสผ่าน」 ที่หน้าเข้าสู่ระบบ
        </p>"""
        html_out = email_shell(
            preheader=f"มีเอกสารใหม่จาก TSAE สำหรับสมาชิก {code}",
            title="มีเอกสารจากสมาคม",
            body_html=body,
            cta_url=login_url,
            cta_label="ดาวน์โหลดเอกสาร →",
            member_code=code,
            site_url=site_url,
        )
        plain = (
            f"เรียน {name}\n\n"
            f"TSAE ได้จัดเตรียมเอกสารสำหรับสมาชิกไว้ให้ท่านแล้ว\n"
            f"รหัสสมาชิก: {code}\n\n"
            f"เข้าสู่ระบบ: {login_url}\n\n"
            f"— TSAE · center@tsae.asia"
        )

    else:
        custom_html = _nl2br(custom_body) if custom_body.strip() else (
            f"<p style='margin:0'>สมาคมวิศวกรรมเกษตรแห่งประเทศไทย (TSAE) มีข้อความถึงท่าน</p>"
        )
        body = f"""
        <p style="margin:0 0 14px">{salutation}</p>
        <div style="font-size:15px;line-height:1.75">{custom_html}</div>"""
        html_out = email_shell(
            preheader=_strip_tags(custom_body)[:120] or "ข้อความจาก TSAE",
            title="ข้อความจากสมาคม",
            body_html=body,
            cta_url=login_url if login_url else f"{site_url}/th/",
            cta_label="เยี่ยมชมเว็บไซต์ TSAE →",
            member_code=code,
            site_url=site_url,
        )
        plain = f"เรียน {name}\n\n{custom_body or 'ข้อความจาก TSAE'}\n\n— center@tsae.asia"

    return subject, html_out, plain


def _plain_invite(name: str, code: str, email: str, login_url: str, password: str = "") -> str:
    pwd_line = f"รหัสผ่าน: {password}\n" if password else ""
    login_num = _member_login_number(code)
    return (
        f"เรียน {name}\n\n"
        f"สมาคมวิศวกรรมเกษตรแห่งประเทศไทย (TSAE) ขอเชิญท่านอัปเดตข้อมูลสมาชิกให้ครบถ้วน\n\n"
        f"รหัสสมาชิก: {code}\n"
        f"เลขเข้าระบบ (กรอกเฉพาะตัวเลข): {login_num}\n"
        f"อีเมล: {email}\n"
        f"{pwd_line}\n"
        f"เข้าสู่ระบบ: กรอกเลขสมาชิก {login_num} หรืออีเมล {email} (อย่างใดอย่างหนึ่ง) + รหัสผ่าน\n"
        f"{login_url}\n\n"
        f"ลืมรหัสผ่าน: ใช้เมนูลืมรหัสผ่านที่หน้าเข้าสู่ระบบ\n\n"
        f"— TSAE\n"
        f"081 807 2458 · center@tsae.asia · www.tsae.asia"
    )


def render_password_reset_email(
    *,
    name: str,
    code: str,
    email: str,
    password: str,
    login_url: str,
    site_url: str = SITE_URL,
) -> tuple[str, str, str]:
    subject = "TSAE — รหัสผ่านเข้าสู่ระบบสมาชิก"
    salutation = f"เรียน {_esc(name)}"
    body = f"""
        <p style="margin:0 0 14px">{salutation}</p>
        <p style="margin:0 0 14px">
          ตามคำขอรีเซ็ตรหัสผ่าน สมาคมวิศวกรรมเกษตรแห่งประเทศไทย (TSAE)
          ได้จัดเตรียม<strong>รหัสผ่านใหม่</strong>สำหรับเข้าสู่ระบบสมาชิกให้ท่านแล้ว
        </p>
        {_credentials_box(code, email, password)}
        <p style="margin:0 0 8px;font-size:14px;line-height:1.7">{_login_field_hint(code, email)}</p>
        <p style="margin:14px 0 0;font-size:13px;color:{C_MUTED}">
          แนะนำให้เปลี่ยนรหัสผ่านหลังเข้าสู่ระบบ · หากท่านไม่ได้ขอรีเซ็ต กรุณาติดต่อ center@tsae.asia ทันที
        </p>"""
    html_out = email_shell(
        preheader=f"รหัสผ่านใหม่สำหรับสมาชิก TSAE — {code}",
        title="รหัสผ่านเข้าสู่ระบบสมาชิก",
        body_html=body,
        cta_url=login_url,
        cta_label="เข้าสู่ระบบสมาชิก →",
        member_code=code,
        site_url=site_url,
    )
    plain = (
        f"เรียน {name}\n\n"
        f"รหัสผ่านเข้าสู่ระบบสมาชิก TSAE ของท่านถูกรีเซ็ตแล้ว\n\n"
        f"รหัสสมาชิก: {code}\n"
        f"เลขเข้าระบบ (กรอกเฉพาะตัวเลข): {_member_login_number(code)}\n"
        f"อีเมล: {email}\n"
        f"รหัสผ่านใหม่: {password}\n\n"
        f"เข้าสู่ระบบ: กรอกเลขสมาชิก {_member_login_number(code)} หรืออีเมล {email} (อย่างใดอย่างหนึ่ง) + รหัสผ่าน\n"
        f"{login_url}\n\n"
        f"— TSAE · center@tsae.asia"
    )
    return subject, html_out, plain


def render_membership_application_notify(
    *,
    name: str,
    email: str,
    phone: str = "",
    organization: str = "",
    membership_type: str = "",
    message: str = "",
    submission_id: int,
    site_url: str = SITE_URL,
) -> tuple[str, str, str]:
    admin_url = f"{site_url}/api/admin/members?tab=applications"
    subject = f"TSAE — ใบสมัครสมาชิกใหม่ #{submission_id} · {name}"
    msg_block = ""
    if message.strip():
        msg_block = f"""
        <p style="margin:14px 0 0;font-size:14px;line-height:1.65;color:{C_TEXT}">
          <strong>ข้อความจากผู้สมัคร:</strong><br>{_nl2br(message.strip())}
        </p>"""
    body = f"""
        <p style="margin:0 0 14px">เรียน เจ้าหน้าที่ TSAE</p>
        <p style="margin:0 0 14px">
          มี<strong>ใบสมัครสมาชิกใหม่</strong>เข้ามาในระบบ กรุณาตรวจสอบหลักฐานการชำระเงิน
          และอนุมัติผ่านหน้าแอดมิน
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="margin:16px 0;background:{C_BG};border-radius:12px;border:1px solid {C_BORDER}">
          <tr><td style="padding:14px 18px;font-size:14px;line-height:1.8;color:{C_TEXT}">
            <strong>เลขที่:</strong> #{submission_id}<br>
            <strong>ชื่อ:</strong> {_esc(name)}<br>
            <strong>อีเมล:</strong> {_esc(email)}<br>
            <strong>โทรศัพท์:</strong> {_esc(phone) or "—"}<br>
            <strong>หน่วยงาน:</strong> {_esc(organization) or "—"}<br>
            <strong>ประเภทสมาชิก:</strong> {_esc(membership_type) or "—"}
          </td></tr>
        </table>
        {msg_block}
        <p style="margin:14px 0 0;font-size:13px;color:{C_MUTED}">
          เปิดดูใบสมัครและสลิปได้ที่หน้าแอดมิน → สมาชิก → ใบสมัครใหม่
        </p>"""
    html_out = email_shell(
        preheader=f"ใบสมัครสมาชิกใหม่ #{submission_id} · {name}",
        title="มีใบสมัครสมาชิกใหม่",
        body_html=body,
        cta_url=admin_url,
        cta_label="เปิดหน้าแอดมิน →",
        site_url=site_url,
    )
    plain = (
        f"มีใบสมัครสมาชิกใหม่ #{submission_id}\n\n"
        f"ชื่อ: {name}\n"
        f"อีเมล: {email}\n"
        f"โทร: {phone or '—'}\n"
        f"หน่วยงาน: {organization or '—'}\n"
        f"ประเภท: {membership_type or '—'}\n"
        f"{('ข้อความ: ' + message.strip() + chr(10)) if message.strip() else ''}"
        f"\nเปิดแอดมิน: {admin_url}\n"
        f"— TSAE"
    )
    return subject, html_out, plain
