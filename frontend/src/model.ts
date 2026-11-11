/**
 * Convenience re-export of the validated public model for use by components.
 *
 * Importing from '@/model' keeps component imports short and makes it obvious which
 * module depends on the authoritative model.
 */

export { publicModel } from '../shared/publicModel';
export { findScenario, optionSetFor } from '@/domain/model';
