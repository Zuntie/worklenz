/**
 * Email masking utility for privacy protection
 * Masks user emails with username@esx-framework.org for non-admin users
 */

/**
 * Options for email masking
 * @interface MaskEmailOptions
 */
export interface MaskEmailOptions {
  /**
   * Whether the requesting user is an admin/owner
   */
  isAdmin?: boolean;
  /**
   * Whether the requesting user is viewing their own profile
   */
  isOwnProfile?: boolean;
  /**
   * Whether this is a pending invitation (should show real email)
   */
  isPendingInvitation?: boolean;
}

/**
 * Masks an email address based on user permissions
 * Returns real email for admins, own profile, or pending invitations
 * Otherwise returns username@esx-framework.org
 *
 * @param originalEmail - The original email address to potentially mask
 * @param username - The username to use in the masked email
 * @param options - Options controlling masking behavior
 * @returns The masked or original email based on permissions
 *
 * @example
 * // Admin viewing any user
 * maskEmail("john@gmail.com", "john_doe", { isAdmin: true })
 * // Returns: "john@gmail.com"
 *
 * @example
 * // Normal user viewing another user
 * maskEmail("john@gmail.com", "john_doe", {})
 * // Returns: "john_doe@esx-framework.org"
 *
 * @example
 * // Pending invitation
 * maskEmail("john@gmail.com", "john_doe", { isPendingInvitation: true })
 * // Returns: "john@gmail.com"
 */
export function maskEmail(
  originalEmail: string | null | undefined,
  username: string | null | undefined,
  options: MaskEmailOptions = {}
): string {
  // Handle null/undefined cases
  if (!originalEmail) {
    return "";
  }

  const { isAdmin = false, isOwnProfile = false, isPendingInvitation = false } = options;

  // Show real email if user is admin/owner
  if (isAdmin) {
    return originalEmail;
  }

  // Show real email if viewing own profile
  if (isOwnProfile) {
    return originalEmail;
  }

  // Show real email for pending invitations (user might not have username yet)
  if (isPendingInvitation) {
    return originalEmail;
  }

  // Mask the email with username@esx-framework.org
  // If no username is available, extract it from the email
  const usernameToUse = username || originalEmail.split("@")[0] || "user";

  return `${usernameToUse}@esx-framework.org`;
}

/**
 * Type guard to check if a value is a string or nullish
 * This helps TypeScript narrow unknown types from T[keyof T]
 *
 * @param value - The value to check
 * @returns True if value is string | null | undefined
 */
function isStringOrNullish(value: unknown): value is string | null | undefined {
  return typeof value === 'string' || value === null || value === undefined;
}

/**
 * Masks email fields in an object or array of objects
 * Useful for bulk processing of API responses
 *
 * @param data - Single object or array of objects containing email fields
 * @param emailField - Name of the email field to mask (default: "email")
 * @param usernameField - Name of the username field to use for masking (default: "name")
 * @param options - Options controlling masking behavior
 * @returns The data with masked email fields
 *
 * @example
 * const users = [
 *   { name: "John Doe", email: "john@gmail.com" },
 *   { name: "Jane Smith", email: "jane@outlook.com" }
 * ];
 *
 * maskEmailInData(users, "email", "name", { isAdmin: false })
 * // Returns:
 * // [
 * //   { name: "John Doe", email: "John Doe@esx-framework.org" },
 * //   { name: "Jane Smith", email: "Jane Smith@esx-framework.org" }
 * // ]
 */
export function maskEmailInData<T extends Record<string, unknown>>(
  data: T | T[],
  emailField: keyof T = "email" as keyof T,
  usernameField: keyof T = "name" as keyof T,
  options: MaskEmailOptions = {}
): T | T[] {
  if (Array.isArray(data)) {
    return data.map(item => {
      if (item && typeof item === "object" && item[emailField]) {
        const emailValue = item[emailField];
        const usernameValue = item[usernameField];

        // Runtime type guard using type predicate
        if (isStringOrNullish(emailValue)) {
          const pendingField: boolean = Boolean(item.pending_invitation || item.is_pending);
          return {
            ...item,
            [emailField]: maskEmail(
              emailValue,
              typeof usernameValue === 'string' ? usernameValue : undefined,
              { ...options, isPendingInvitation: pendingField }
            )
          };
        }
      }
      return item;
    });
  } else if (data && typeof data === "object" && data[emailField]) {
    const emailValue = data[emailField];
    const usernameValue = data[usernameField];

    // Runtime type guard using type predicate
    if (isStringOrNullish(emailValue)) {
      const pendingField: boolean = Boolean(data.pending_invitation || data.is_pending);
      return {
        ...data,
        [emailField]: maskEmail(
          emailValue,
          typeof usernameValue === 'string' ? usernameValue : undefined,
          { ...options, isPendingInvitation: pendingField }
        )
      };
    }
  }

  return data;
}

/**
 * Masks multiple email fields in an object
 * Useful when objects have multiple email fields (e.g., user_email, invitee_email)
 *
 * @param data - Object or array of objects
 * @param emailFields - Array of email field names to mask
 * @param usernameField - Name of the username field to use for masking
 * @param options - Options controlling masking behavior
 * @returns The data with all specified email fields masked
 *
 * @example
 * const workLog = {
 *   user_name: "John Doe",
 *   user_email: "john@gmail.com",
 *   reporter_email: "admin@company.com"
 * };
 *
 * maskMultipleEmailFields(
 *   workLog,
 *   ["user_email", "reporter_email"],
 *   "user_name",
 *   { isAdmin: false }
 * )
 */
export function maskMultipleEmailFields<T extends Record<string, unknown>>(
  data: T | T[],
  emailFields: (keyof T)[],
  usernameField: keyof T = "name" as keyof T,
  options: MaskEmailOptions = {}
): T | T[] {
  if (Array.isArray(data)) {
    return data.map(item => {
      if (item && typeof item === "object") {
        const maskedItem = { ...item };
        const pendingField: boolean = Boolean(item.pending_invitation || item.is_pending);

        emailFields.forEach(emailField => {
          const emailValue = maskedItem[emailField];
          const usernameValue = maskedItem[usernameField];

          // Runtime type guard using type predicate
          if (isStringOrNullish(emailValue)) {
            maskedItem[emailField] = maskEmail(
              emailValue,
              typeof usernameValue === 'string' ? usernameValue : undefined,
              { ...options, isPendingInvitation: pendingField }
            ) as T[keyof T];
          }
        });

        return maskedItem;
      }
      return item;
    });
  } else if (data && typeof data === "object") {
    const maskedData = { ...data };
    const pendingField: boolean = Boolean(data.pending_invitation || data.is_pending);

    emailFields.forEach(emailField => {
      const emailValue = maskedData[emailField];
      const usernameValue = maskedData[usernameField];

      // Runtime type guard using type predicate
      if (isStringOrNullish(emailValue)) {
        maskedData[emailField] = maskEmail(
          emailValue,
          typeof usernameValue === 'string' ? usernameValue : undefined,
          { ...options, isPendingInvitation: pendingField }
        ) as T[keyof T];
      }
    });

    return maskedData;
  }

  return data;
}
