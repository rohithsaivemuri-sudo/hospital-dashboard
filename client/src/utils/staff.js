// How staff are named on screen: "Full name (username)".
export const staffName = (fullName, username) => (fullName ? `${fullName} (${username})` : username || '');

export const ROLE_LABEL = {
  ADMIN: 'Administrator', DOCTOR: 'Doctor', NURSE: 'Nurse', RECEPTIONIST: 'Receptionist', LABORATORY: 'Laboratory', PHARMACY: 'Pharmacy',
};
export const roleLabel = (role) => ROLE_LABEL[role] || role || '';
