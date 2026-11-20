import React from "react";
import {NavLink} from "react-router-dom";

const mailboxes = [
  ["Support", "support", "Account help, login problems, password resets, and general assistance."],
  ["Contact", "contact", <>For official inquiries, account support, legal notices, and security reports. For suggestions and general discussion, use the <NavLink to="/community">Community chatroom</NavLink>.</>],
  ["Privacy", "privacy", "Privacy questions, data requests, account information, or deletion help."],
  ["Security", "security", "Responsible vulnerability reports and security concerns."],
  ["Legal", "legal", "Copyright concerns, legal notices, and other legal correspondence."],
  ["Admin", "admin", "Administration, partnerships, and business inquiries."]
];

export default function ContactPage(){
  return <section className="ogcl-view ogcl-editorial" aria-labelledby="contact-title">
    <header className="ogcl-view-head"><h1 id="contact-title">Contact</h1>
      <p>Talk to a real person behind OG Cupid. Questions, feedback, support, legal notices, and security reports all have a dedicated inbox.</p>
      <p>Effective and last updated: November 12, 2026</p></header>
    <div className="ogcl-content-panel">
      <p><strong>We're building OG Cupid in public.</strong> If something breaks, you have a suggestion, or you need a human to look at an account or safety concern, email the appropriate mailbox below. This page opens your email app; there is no website message form.</p>
      <h2>Get help</h2><p><a href="mailto:support@ogcupid.com?subject=OG%20Cupid%20support%20request">support@ogcupid.com</a></p>
      <p>Account access, password recovery, problems saving a profile, questions about your membership, or general support.</p>
      <p>For the fastest response, describe what happened, the page you were on, and roughly when. If you have an account, include the email address associated with it <em>only if you are comfortable doing so</em>.</p>
      <h2>Every mailbox has a job</h2>
      {mailboxes.map(([title,address,description])=><section key={address}><h3>{title}</h3><p><a href={`mailto:${address}@ogcupid.com?subject=OG%20Cupid%20${address}%20inquiry`}>{address}@ogcupid.com</a></p><p>{description}</p></section>)}
      <h2>Privacy requests and reports</h2>
      <p>Use <a href="mailto:privacy@ogcupid.com?subject=Privacy%20request">privacy@ogcupid.com</a> to ask about personal data or request assistance with deletion. Signed-in members can also request account deletion through their account controls, subject to reauthentication.</p>
      <p>Use <a href="mailto:security@ogcupid.com?subject=Security%20report">security@ogcupid.com</a> to report a vulnerability or suspected unauthorized access. Please don't send credentials, passwords, private keys, recovery codes, or other people's sensitive information. Start with a short description and a safe reproduction outline.</p>
      <p>For urgent threats to anyone's immediate safety, contact local emergency services. These inboxes are not monitored as an emergency response line.</p>
      <h2>Before you email</h2><p>OG Cupid is under active construction. Email is handled manually, and no specific response-time guarantee is offered. The availability of an email address doesn't mean every requested feature or service is already live.</p>
      <p>See our <NavLink to="/privacy">Privacy Policy</NavLink> for information about data handling and the <NavLink to="/terms">Terms &amp; Conditions</NavLink> for use of the site.</p>
    </div>
  </section>;
}
