'use client';

import { useState } from 'react';

import { predatorAlertMessage, type EmergencyContact } from '@/lib/emergency-contacts';

export function EmergencyContacts({ contacts }: { contacts: EmergencyContact[] }) {
  const [sharedId, setSharedId] = useState<string | null>(null);

  async function share(contact: EmergencyContact) {
    const text = predatorAlertMessage(contact);
    try {
      if (navigator.share) await navigator.share({ title: 'Predator alert', text });
      else if (navigator.clipboard) await navigator.clipboard.writeText(text);
      else return;
      setSharedId(contact.id);
    } catch {
      // User dismissed the share sheet - not an error.
    }
  }

  return (
    <section className="sidebar-section" aria-labelledby="emergency-contacts-heading">
      <h2 id="emergency-contacts-heading" className="sidebar-heading">Emergency contacts</h2>
      <p className="muted sidebar-note">For a predator alert - call or share fast.</p>
      <ul className="emergency-list">
        {contacts.map((contact) => (
          <li key={contact.id} className="emergency-card">
            <strong>{contact.label}</strong>
            <span className="muted">{contact.detail}</span>
            {contact.phone ? <span className="emergency-phone">{contact.phone}</span> : <span className="muted">No number on file</span>}
            <span className="emergency-actions">
              {contact.tel ? <a className="btn-call" href={`tel:${contact.tel}`}>Call</a> : <button type="button" disabled>Call</button>}
              <button type="button" onClick={() => void share(contact)}>{sharedId === contact.id ? 'Shared / copied' : 'Share'}</button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
