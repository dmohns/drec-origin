import {
    Role,
    useInvitationControllerGetInvitations,
    UserStatus
} from '@energyweb/origin-drec-api-client';
import { useUser, useAxiosInterceptors } from 'api';
import { getOrganizationMenu, TGetOrganizationMenuArgs } from 'apps/organization';
import { getDeviceGroupMenu, TGetDeviceGroupMenuArgs } from 'apps/device-group';
import { getAccountMenu, TGetAccountMenuArgs, getAdminMenu, TGetAdminMenuArgs } from 'apps/user';
import { useActiveMenuTab, useTopbarButtonList } from 'shared';
import { getCertificateMenu, TGetCertificateMenuArgs } from 'apps/certificate/logic';
import { isRole } from 'utils';

export type RoutesConfig = {
    orgRoutes: Omit<TGetOrganizationMenuArgs, 'isOpen' | 'showSection'>;
    deviceGroupRoutes: Omit<TGetDeviceGroupMenuArgs, 'isOpen' | 'showSection'>;
    certificateRoutes: Omit<TGetCertificateMenuArgs, 'isOpen' | 'showSection'>;
    accountRoutes: Omit<TGetAccountMenuArgs, 'isOpen' | 'showSection'>;
    adminRoutes: Omit<TGetAdminMenuArgs, 'isOpen' | 'showSection'>;
};

export const useAppContainerEffects = () => {
    useAxiosInterceptors();

    const { isAuthenticated, user, logout, userLoading } = useUser();

    const topbarButtons = useTopbarButtonList(isAuthenticated, logout);
    const {
        isOrganizationTabActive,
        isCertificateTabActive,
        isDeviceTabActive,
        isDeviceGroupTabActive,
        isAccountTabActive,
        isAdminTabAcive
    } = useActiveMenuTab();
    const { data: userInvitations, isLoading: areInvitationsLoading } =
        useInvitationControllerGetInvitations({
            query: { enabled: isAuthenticated }
        });
    const userHasOrg = Boolean(user?.organization?.id);
    const userIsOrgAdmin = isRole(user?.role, Role.OrganizationAdmin);

    const userIsDeviceManagerOrAdmin = isRole(user?.role, Role.DeviceOwner, Role.OrganizationAdmin);
    const userIsActive = user && user.status === UserStatus.Active;
    const userIsAdminOrSupport = isRole(user?.role, Role.Admin, Role.SupportAgent);
    const userIsOrgAdminOrAdminOrSupport = isRole(
        user?.role,
        Role.OrganizationAdmin,
        Role.Admin,
        Role.SupportAgent
    );
    const userOrgHasBlockchainAccountAttached = Boolean(
        user?.organization?.blockchainAccountAddress
    );
    const userIsBuyer = isRole(user?.role, Role.Buyer);

    const orgRoutesConfig: RoutesConfig['orgRoutes'] = {
        showRegisterOrg: !userHasOrg,
        showMyOrg: userHasOrg,
        showMembers: userHasOrg && userIsOrgAdmin,
        showInvitations:
            userHasOrg && userIsOrgAdmin ? true : !!userInvitations && userInvitations.length > 0,
        showInvite: userIsActive && userHasOrg && userIsOrgAdmin
    };
    const orgMenu = getOrganizationMenu({
        isOpen: isOrganizationTabActive,
        showSection: userIsOrgAdminOrAdminOrSupport,
        ...orgRoutesConfig
    });

    const accountRoutesConfig: RoutesConfig['accountRoutes'] = {
        showUserProfile: isAuthenticated
    };
    const accountMenu = getAccountMenu({
        isOpen: isAccountTabActive,
        showSection: true,
        ...accountRoutesConfig
    });

    const adminRoutesConfig: RoutesConfig['adminRoutes'] = {
        showUsers: userIsAdminOrSupport,
        showAllOrgs: isAuthenticated && userIsActive && userIsAdminOrSupport
    };
    const adminMenu = getAdminMenu({
        isOpen: isAdminTabAcive,
        showSection: userIsAdminOrSupport,
        ...adminRoutesConfig
    });

    const certificateRoutesConfig: RoutesConfig['certificateRoutes'] = {
        showBlockchainInbox: userIsActive && userHasOrg && userOrgHasBlockchainAccountAttached
    };
    const certificateMenu = getCertificateMenu({
        isOpen: isCertificateTabActive,
        showSection: userIsActive && userHasOrg && userOrgHasBlockchainAccountAttached,
        ...certificateRoutesConfig
    });

    const deviceGroupRoutesConfig: RoutesConfig['deviceGroupRoutes'] = {
        showAllDeviceGroups: true,
        showMyDeviceGroups: userIsActive && userHasOrg && userIsDeviceManagerOrAdmin,
        showUngroupedDevices: userIsActive && userHasOrg && userIsDeviceManagerOrAdmin,
        showUnreserved: userIsActive && userIsBuyer
    };
    const deviceGroupMenu = getDeviceGroupMenu({
        isOpen: isDeviceGroupTabActive,
        showSection: true,
        ...deviceGroupRoutesConfig
    });

    const menuSections = [
        // deviceMenu,
        deviceGroupMenu,
        certificateMenu,
        orgMenu,
        accountMenu,
        adminMenu
    ];

    const routesConfig: RoutesConfig = {
        orgRoutes: orgRoutesConfig,
        deviceGroupRoutes: deviceGroupRoutesConfig,
        certificateRoutes: certificateRoutesConfig,
        accountRoutes: accountRoutesConfig,
        adminRoutes: adminRoutesConfig
    };

    const isLoading = userLoading || areInvitationsLoading;

    return {
        topbarButtons,
        isAuthenticated,
        menuSections,
        user,
        isLoading,
        routesConfig
    };
};
