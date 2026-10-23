export interface EmergencyContact {
  id: string;
  label: string;
  detail: string;
  phone?: string;
  tel?: string;
}

function telHref(phone: string): string {
  return phone.replace(/[^+0-9]/g, '');
}
/**
 * Emergency contacts for the left sidebar. Public helplines are published
 */
export function emergencyContactsFromEnv(env: NodeJS.ProcessEnv = process.env): EmergencyContact[] {
  const contacts: EmergencyContact[] = [
    { id: 'emergency-services', label: 'Emergency services', detail: 'Life-threatening danger or a predator near people', phone: '911', tel: '911' }
  ];
  const ownPhone = env.EMERGENCY_CONTACT_PHONE?.trim();
  const ownName = env.EMERGENCY_CONTACT_NAME?.trim() || 'Farm emergency contact';
  contacts.push(ownPhone ? { id: 'farm-contact', label: ownName, detail: 'Your own contact for a predator alert', phone: ownPhone, tel: telHref(ownPhone) } : { id: 'farm-contact', label: ownName, detail: 'No farm emergency contact added on this deployment' });
  return contacts;
}

export function predatorAlertMessage(contact: EmergencyContact): string {
  const number = contact.phone ? `${contact.label}: ${contact.phone}` : contact.label;
  return `Predator alert from Predator Guard - please help. Emergency contact - ${number}.`;
}
