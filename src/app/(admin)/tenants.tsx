/**
 * Admin-only tenant setup — districts, ULBs, wards, and assessment years.
 */
import { AppButton, Spinner, Toast } from '@/components';
import { AdminHeader } from '@/components/admin/admin-header';
import {
  AddDistrictSection,
  AddUlbSection,
  AddWardSection,
  AssessmentYearsSection,
  DistrictTreeSection,
} from '@/components/admin/tenant-sections';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useClerkConvexAuth } from '@/hooks/use-clerk-convex-auth';
import { toUserMessage } from '@/utils/errors';
import { useMutation, useQuery } from 'convex/react';
import { useCallback, useMemo, useReducer } from 'react';
import { Alert, ScrollView, View } from 'react-native';

type TenantsState = {
  expandedDistrict: string | null;
  toast: { title: string; tone: 'success' | 'danger' } | null;
  busy: boolean;
  districtName: string;
  selectedDistrictId: string;
  ulbCode: string;
  ulbName: string;
  ulbPostalCode: string;
  ulbBodyType: string;
  wardMunicipalityId: string;
  wardNo: string;
  wardCode: string;
  wardName: string;
  yearValue: string;
  yearLabel: string;
};

type TenantsAction =
  | { type: 'toggleDistrict'; districtId: string }
  | { type: 'setBusy'; busy: boolean }
  | { type: 'setToast'; toast: TenantsState['toast'] }
  | { type: 'clearToast' }
  | { type: 'setDistrictName'; value: string }
  | { type: 'setSelectedDistrictId'; value: string }
  | { type: 'setUlbCode'; value: string }
  | { type: 'setUlbName'; value: string }
  | { type: 'setUlbPostalCode'; value: string }
  | { type: 'setUlbBodyType'; value: string }
  | { type: 'setWardMunicipalityId'; value: string }
  | { type: 'setWardNo'; value: string }
  | { type: 'setWardCode'; value: string }
  | { type: 'setWardName'; value: string }
  | { type: 'setYearValue'; value: string }
  | { type: 'setYearLabel'; value: string }
  | { type: 'clearDistrictForm' }
  | { type: 'clearUlbForm' }
  | { type: 'clearWardForm' }
  | { type: 'clearYearForm' };

const initialTenantsState: TenantsState = {
  expandedDistrict: null,
  toast: null,
  busy: false,
  districtName: '',
  selectedDistrictId: '',
  ulbCode: '',
  ulbName: '',
  ulbPostalCode: '',
  ulbBodyType: 'municipal_council',
  wardMunicipalityId: '',
  wardNo: '',
  wardCode: '',
  wardName: '',
  yearValue: '',
  yearLabel: '',
};

function tenantsReducer(state: TenantsState, action: TenantsAction): TenantsState {
  switch (action.type) {
    case 'toggleDistrict':
      return {
        ...state,
        expandedDistrict: state.expandedDistrict === action.districtId ? null : action.districtId,
      };
    case 'setBusy':
      return { ...state, busy: action.busy };
    case 'setToast':
      return { ...state, toast: action.toast };
    case 'clearToast':
      return { ...state, toast: null };
    case 'setDistrictName':
      return { ...state, districtName: action.value };
    case 'setSelectedDistrictId':
      return { ...state, selectedDistrictId: action.value };
    case 'setUlbCode':
      return { ...state, ulbCode: action.value };
    case 'setUlbName':
      return { ...state, ulbName: action.value };
    case 'setUlbPostalCode':
      return { ...state, ulbPostalCode: action.value };
    case 'setUlbBodyType':
      return { ...state, ulbBodyType: action.value };
    case 'setWardMunicipalityId':
      return { ...state, wardMunicipalityId: action.value };
    case 'setWardNo':
      return { ...state, wardNo: action.value };
    case 'setWardCode':
      return { ...state, wardCode: action.value };
    case 'setWardName':
      return { ...state, wardName: action.value };
    case 'setYearValue':
      return { ...state, yearValue: action.value };
    case 'setYearLabel':
      return { ...state, yearLabel: action.value };
    case 'clearDistrictForm':
      return { ...state, districtName: '' };
    case 'clearUlbForm':
      return { ...state, ulbCode: '', ulbName: '', ulbPostalCode: '' };
    case 'clearWardForm':
      return { ...state, wardNo: '', wardCode: '', wardName: '' };
    case 'clearYearForm':
      return { ...state, yearValue: '', yearLabel: '' };
    default:
      return state;
  }
}

export default function AdminTenantsScreen() {
  const { convexReady } = useClerkConvexAuth();
  const queryArgs = convexReady ? {} : ('skip' as const);
  const tree = useQuery(api.tenants.listForAdmin, queryArgs);
  const assessmentYears = useQuery(api.tenants.listAssessmentYears, queryArgs);
  const seed = useMutation(api.tenants.seedReferenceData);
  const upsertDistrict = useMutation(api.tenants.upsertDistrict);
  const upsertMunicipality = useMutation(api.tenants.upsertMunicipality);
  const upsertWard = useMutation(api.tenants.upsertWard);
  const upsertAssessmentYear = useMutation(api.tenants.upsertAssessmentYear);

  const [state, dispatch] = useReducer(tenantsReducer, initialTenantsState);
  const hideToast = useCallback(() => dispatch({ type: 'clearToast' }), []);

  const districtOptions = useMemo(() => tree?.map((d) => ({ value: d._id, label: d.name })) ?? [], [tree]);

  const ulbOptions = useMemo(() => {
    if (!tree) return [];
    return tree.flatMap((d) =>
      d.ulbs.map((u) => ({
        value: u._id,
        label: `${u.name} (${d.name})`,
      })),
    );
  }, [tree]);

  const makeDistrictCode = (name: string) => {
    const base = name
      .replace(/[^a-zA-Z]/g, '')
      .toUpperCase()
      .slice(0, 3)
      .padEnd(3, 'X');
    const used = new Set(tree?.map((d) => d.code) ?? []);
    if (!used.has(base)) return base;
    for (let n = 2; n < 100; n++) {
      const candidate = `${base.slice(0, 2)}${n}`;
      if (!used.has(candidate)) return candidate;
    }
    return `${base}${Date.now().toString(36).slice(-2).toUpperCase()}`;
  };

  const onSeed = () => {
    const hasData = (tree?.length ?? 0) > 0;
    Alert.alert(
      hasData ? 'Refresh reference data?' : 'Seed reference data?',
      hasData
        ? 'Updates existing UP districts, ULBs, wards, and assessment years from the built-in catalog. Your custom rows are kept.'
        : 'Loads UP districts (Agra, Etah, Baghpat, Mainpuri, Kasganj), sample ULBs, wards with codes, and assessment years 2025-26 / 2026-27.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: hasData ? 'Refresh' : 'Seed',
          onPress: async () => {
            dispatch({ type: 'setBusy', busy: true });
            try {
              await seed({});
              dispatch({
                type: 'setToast',
                toast: {
                  title: hasData ? 'Reference data refreshed' : 'Reference data seeded',
                  tone: 'success',
                },
              });
            } catch (e) {
              dispatch({ type: 'setToast', toast: { title: toUserMessage(e), tone: 'danger' } });
            } finally {
              dispatch({ type: 'setBusy', busy: false });
            }
          },
        },
      ],
    );
  };

  const onAddDistrict = async () => {
    dispatch({ type: 'setBusy', busy: true });
    try {
      const name = state.districtName.trim();
      if (!name) {
        dispatch({ type: 'setToast', toast: { title: 'District name is required', tone: 'danger' } });
        return;
      }
      await upsertDistrict({
        code: makeDistrictCode(name),
        name,
        stateName: 'Uttar Pradesh',
        isActive: true,
      });
      dispatch({ type: 'clearDistrictForm' });
      dispatch({ type: 'setToast', toast: { title: 'District saved', tone: 'success' } });
    } catch (e) {
      dispatch({ type: 'setToast', toast: { title: toUserMessage(e), tone: 'danger' } });
    } finally {
      dispatch({ type: 'setBusy', busy: false });
    }
  };

  const onAddUlb = async () => {
    if (!state.selectedDistrictId) {
      dispatch({ type: 'setToast', toast: { title: 'Select a district first', tone: 'danger' } });
      return;
    }
    const pin = state.ulbPostalCode.replace(/\D/g, '').slice(0, 6);
    if (!/^[1-9]\d{5}$/.test(pin)) {
      dispatch({ type: 'setToast', toast: { title: 'Enter a valid 6-digit PIN for this ULB', tone: 'danger' } });
      return;
    }
    dispatch({ type: 'setBusy', busy: true });
    try {
      await upsertMunicipality({
        districtId: state.selectedDistrictId as Id<'districts'>,
        code: state.ulbCode,
        name: state.ulbName,
        bodyType: state.ulbBodyType as 'municipal_council',
        postalCode: pin,
        isActive: true,
      });
      dispatch({ type: 'clearUlbForm' });
      dispatch({ type: 'setToast', toast: { title: 'ULB saved', tone: 'success' } });
    } catch (e) {
      dispatch({ type: 'setToast', toast: { title: toUserMessage(e), tone: 'danger' } });
    } finally {
      dispatch({ type: 'setBusy', busy: false });
    }
  };

  const onAddWard = async () => {
    if (!state.wardMunicipalityId) {
      dispatch({ type: 'setToast', toast: { title: 'Select a ULB for the ward', tone: 'danger' } });
      return;
    }
    const trimmedNo = state.wardNo.trim();
    const trimmedName = state.wardName.trim();
    if (!trimmedNo) {
      dispatch({ type: 'setToast', toast: { title: 'Ward number is required', tone: 'danger' } });
      return;
    }
    if (!trimmedName) {
      dispatch({ type: 'setToast', toast: { title: 'Ward name is required', tone: 'danger' } });
      return;
    }
    dispatch({ type: 'setBusy', busy: true });
    try {
      const trimmedCode = state.wardCode.trim();
      await upsertWard({
        municipalityId: state.wardMunicipalityId as Id<'municipalities'>,
        wardNo: trimmedNo,
        ...(trimmedCode ? { wardCode: trimmedCode } : {}),
        name: trimmedName,
      });
      dispatch({ type: 'clearWardForm' });
      dispatch({ type: 'setToast', toast: { title: 'Ward saved', tone: 'success' } });
    } catch (e) {
      dispatch({ type: 'setToast', toast: { title: toUserMessage(e), tone: 'danger' } });
    } finally {
      dispatch({ type: 'setBusy', busy: false });
    }
  };

  const onAddAssessmentYear = async () => {
    const value = state.yearValue.trim();
    const label = state.yearLabel.trim() || value;
    if (!value) {
      dispatch({
        type: 'setToast',
        toast: { title: 'Assessment year value is required (e.g. 2027-28)', tone: 'danger' },
      });
      return;
    }
    dispatch({ type: 'setBusy', busy: true });
    try {
      await upsertAssessmentYear({ value, label });
      dispatch({ type: 'clearYearForm' });
      dispatch({ type: 'setToast', toast: { title: 'Assessment year saved', tone: 'success' } });
    } catch (e) {
      dispatch({ type: 'setToast', toast: { title: toUserMessage(e), tone: 'danger' } });
    } finally {
      dispatch({ type: 'setBusy', busy: false });
    }
  };

  if (tree === undefined || assessmentYears === undefined) {
    return (
      <View className="flex-1 bg-page-light dark:bg-page-dark">
        <AdminHeader title="Tenants" subtitle="Loading…" />
        <Spinner label="Loading tenants…" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-page-light dark:bg-page-dark">
      <AdminHeader
        title="Tenant setup"
        subtitle="Districts, ULBs, wards, assessment years — field users see scoped data only"
        footer={
          <AppButton
            label={state.busy ? 'Working…' : 'Seed UP reference data'}
            onPress={onSeed}
            loading={state.busy}
            variant="outline"
            size="sm"
            className="mt-3"
            iconLeft="cloud-download-outline"
          />
        }
      />

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 32 }}>
        <AssessmentYearsSection
          years={assessmentYears}
          yearValue={state.yearValue}
          yearLabel={state.yearLabel}
          busy={state.busy}
          onYearValueChange={(v) => dispatch({ type: 'setYearValue', value: v })}
          onYearLabelChange={(v) => dispatch({ type: 'setYearLabel', value: v })}
          onAdd={onAddAssessmentYear}
        />
        <AddDistrictSection
          districtName={state.districtName}
          busy={state.busy}
          onDistrictNameChange={(v) => dispatch({ type: 'setDistrictName', value: v })}
          onAdd={onAddDistrict}
        />
        <AddUlbSection
          selectedDistrictId={state.selectedDistrictId}
          ulbCode={state.ulbCode}
          ulbName={state.ulbName}
          ulbPostalCode={state.ulbPostalCode}
          ulbBodyType={state.ulbBodyType}
          districtOptions={districtOptions}
          busy={state.busy}
          onDistrictChange={(v) => dispatch({ type: 'setSelectedDistrictId', value: v })}
          onUlbCodeChange={(v) => dispatch({ type: 'setUlbCode', value: v })}
          onUlbNameChange={(v) => dispatch({ type: 'setUlbName', value: v })}
          onUlbPostalCodeChange={(v) => dispatch({ type: 'setUlbPostalCode', value: v })}
          onUlbBodyTypeChange={(v) => dispatch({ type: 'setUlbBodyType', value: v })}
          onAdd={onAddUlb}
        />
        <AddWardSection
          wardMunicipalityId={state.wardMunicipalityId}
          wardNo={state.wardNo}
          wardCode={state.wardCode}
          wardName={state.wardName}
          ulbOptions={ulbOptions}
          busy={state.busy}
          onMunicipalityChange={(v) => dispatch({ type: 'setWardMunicipalityId', value: v })}
          onWardNoChange={(v) => dispatch({ type: 'setWardNo', value: v })}
          onWardCodeChange={(v) => dispatch({ type: 'setWardCode', value: v })}
          onWardNameChange={(v) => dispatch({ type: 'setWardName', value: v })}
          onAdd={onAddWard}
        />
        <DistrictTreeSection
          tree={tree}
          expandedDistrict={state.expandedDistrict}
          onToggleDistrict={(districtId) => dispatch({ type: 'toggleDistrict', districtId })}
        />
      </ScrollView>

      {state.toast ? <Toast visible title={state.toast.title} tone={state.toast.tone} onHide={hideToast} /> : null}
    </View>
  );
}
