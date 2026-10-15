/// Every address in the app, in one place. Screens navigate with these
/// (`context.go(Routes.lead(id))`) and never write a path by hand.
abstract final class Routes {
  // Before sign-in.
  static const starting = '/starting';
  static const server = '/server';
  static const signIn = '/sign-in';
  static const forgotPassword = '/forgot-password';

  // The tabs.
  static const home = '/home';
  static const leads = '/leads';
  static const tasks = '/tasks';
  static const more = '/more';

  // Leads.
  static const newLead = '/leads/new';
  static String lead(String id) => '/leads/$id';
  static String editLead(String id) => '/leads/$id/edit';

  // Contacts (under More).
  static const contacts = '/more/contacts';
  static const newContact = '/more/contacts/new';

  /// The new-contact form with a company filled in ("Add contact" on a company's page).
  static String newContactIn(String companyId) =>
      '/more/contacts/new?companyId=$companyId';
  static String contact(String id) => '/more/contacts/$id';
  static String editContact(String id) => '/more/contacts/$id/edit';

  // Companies (under More).
  static const companies = '/more/companies';
  static const newCompany = '/more/companies/new';
  static String company(String id) => '/more/companies/$id';
  static String editCompany(String id) => '/more/companies/$id/edit';

  // Opportunities (under More).
  static const opportunities = '/more/opportunities';
  static const newOpportunity = '/more/opportunities/new';
  static String opportunity(String id) => '/more/opportunities/$id';
  static String editOpportunity(String id) => '/more/opportunities/$id/edit';

  // Quotes: read on the page of their opportunity, so Back leads to it.
  static String quote(String opportunityId, String quoteId) =>
      '/more/opportunities/$opportunityId/quotes/$quoteId';

  // Tasks. A task has no page of its own: `?open=<id>` opens its sheet over the Tasks
  // tab (the link of a notification), and `?due=<group>` shows one due group (a Home tile).
  static String openTask(String id) => '/tasks?open=$id';
  static String tasksDue(String due) => '/tasks?due=$due';

  // Notifications and the activity feed (under More).
  static const notifications = '/more/notifications';
  static const activity = '/more/activity';
}
