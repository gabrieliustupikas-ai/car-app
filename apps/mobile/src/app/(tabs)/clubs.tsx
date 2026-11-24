import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/ui/Screen';
import { EmptyState } from '@/components/ui/States';

export default function ClubsScreen() {
  const { t } = useTranslation();
  return (
    <Screen title={t('clubs.title')} scroll={false} overMap>
      <EmptyState icon="people-outline" title={t('clubs.soonTitle')} body={t('clubs.soonBody')} />
    </Screen>
  );
}
