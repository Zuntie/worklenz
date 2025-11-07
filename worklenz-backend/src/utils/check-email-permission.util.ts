/**
 * Permission utility for checking if a user can view unmasked emails
 */

import { IPassportSession } from "../interfaces/passport-session";

/**
 * Checks if the requesting user has permission to view unmasked emails
 *
 * @param requestUser - The user making the request (from req.user)
 * @param targetUserId - Optional target user ID being viewed
 * @returns Object with permission flags for email masking
 *
 * @example
 * // Admin user
 * const permissions = checkEmailPermission(req.user, "some-user-id");
 * // Returns: { isAdmin: true, isOwnProfile: false }
 *
 * @example
 * // Normal user viewing their own profile
 * const permissions = checkEmailPermission(req.user, req.user.id);
 * // Returns: { isAdmin: false, isOwnProfile: true }
 */
export function checkEmailPermission(
  requestUser: IPassportSession | undefined,
  targetUserId?: string
): {
  isAdmin: boolean;
  isOwnProfile: boolean;
} {
  // Default: no permissions
  if (!requestUser) {
    return { isAdmin: false, isOwnProfile: false };
  }

  // Check if user is admin or owner
  const isAdmin = requestUser.is_admin === true || requestUser.owner === true;

  // Check if viewing own profile
  const isOwnProfile = targetUserId !== undefined && requestUser.id === targetUserId;

  return {
    isAdmin,
    isOwnProfile
  };
}

/**
 * Simplified check: Can this user view unmasked emails?
 *
 * @param requestUser - The user making the request
 * @param targetUserId - Optional target user ID being viewed
 * @returns True if user can view unmasked emails
 *
 * @example
 * if (canViewUnmaskedEmail(req.user)) {
 *   // Show real email
 * }
 */
export function canViewUnmaskedEmail(
  requestUser: IPassportSession | undefined,
  targetUserId?: string
): boolean {
  const permissions = checkEmailPermission(requestUser, targetUserId);
  return permissions.isAdmin || permissions.isOwnProfile;
}

/**
 * Get masking options based on user permissions
 * Ready to use with maskEmail() function
 *
 * @param requestUser - The user making the request
 * @param targetUserId - Optional target user ID being viewed
 * @returns MaskEmailOptions object
 *
 * @example
 * import { maskEmail } from "./mask-email.util";
 * import { getMaskingOptions } from "./check-email-permission.util";
 *
 * const options = getMaskingOptions(req.user, targetUser.id);
 * const maskedEmail = maskEmail(targetUser.email, targetUser.name, options);
 */
export function getMaskingOptions(
  requestUser: IPassportSession | undefined,
  targetUserId?: string
): {
  isAdmin: boolean;
  isOwnProfile: boolean;
} {
  return checkEmailPermission(requestUser, targetUserId);
}
