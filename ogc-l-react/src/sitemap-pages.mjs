// Canonical, user-facing page directory. No personal profile slugs,
// individual message threads, internal endpoints or legacy redirect aliases.
export const SITEMAP_SECTIONS=Object.freeze([
  {title:"Getting started & your account",items:[
    {path:"/home",label:"Home",note:"Member landing page",access:"member"},
    {path:"/signup",label:"Sign up",note:"Begin registration",access:"public"},
    {path:"/signup1",label:"Sign up – first step",note:"Begin registration",access:"public"},
    {path:"/signup2",label:"Sign up – account",note:"Create your account credentials",access:"public"},
    {path:"/signup3",label:"Sign up – identity",note:"Choose identity and dating preferences",access:"member"},
    {path:"/signup4",label:"Sign up – location",note:"Choose your country and city",access:"member"},
    {path:"/signup5",label:"Sign up – work and education",note:"Career details",access:"member"},
    {path:"/signup6",label:"Sign up – lifestyle",note:"Lifestyle details",access:"member"},
    {path:"/signup7",label:"Sign up – relationships",note:"Relationship and pet preferences",access:"member"},
    {path:"/signup8",label:"Sign up – personal",note:"Personal details and languages",access:"member"},
    {path:"/join",label:"Join OG Cupid",note:"Create an account",access:"public"},
    {path:"/signin",label:"Sign in",note:"Existing member access",access:"public"},
    {path:"/recover",label:"Recover your account",note:"Password recovery",access:"public"},
    {path:"/verify",label:"Verify email",note:"Email verification",access:"public"},
    {path:"/onboarding",label:"Getting started",note:"Complete your profile setup",access:"member"},
    {path:"/account",label:"Account management",note:"Account and security controls",access:"member"}
  ]},
  {title:"Find people & connect",items:[
    {path:"/matches",label:"Matches",note:"Search, Quiver and Favorites",access:"member"},
    {path:"/quickmatch",label:"Quickmatch",note:"People and mutual interest",access:"member"},
    {path:"/visitors",label:"Visitors",note:"Visitor feature preview",access:"member"},
    {path:"/messages",label:"Messages",note:"Private conversations",access:"member"},
    {path:"/community",label:"Community",note:"Public conversation spaces",access:"member"},
    {path:"/questions",label:"Match questions",note:"Your answers and compatibility",access:"member"}
  ]},
  {title:"Your profile tools",items:[
    {path:"/profile",label:"Edit your profile",note:"Essays and profile editor",access:"member"},
    {path:"/photos",label:"Manage photos",note:"Your profile pictures",access:"member"},
    {path:"/settings",label:"Profile settings",note:"Details, preferences and blocked members",access:"member"}
  ]},
  {title:"Personality & reading",items:[
    {path:"/persona",label:"The Dating Persona Test",note:"Personality quiz",access:"member"},
    {path:"/ogtrends",label:"OgTrends",note:"Research and writing",access:"public"},
    {path:"/ogtrends/zero",label:"OgTrends #0: The Big Idea",note:"Introducing the project",access:"public"},
    {path:"/ogtrends/perfect-profile",label:"The Perfect Dating Profile",note:"Profile-writing guide",access:"public"},
    {path:"/ogtrends/references",label:"Dating References",note:"Sources and references",access:"public"}
  ]},
  {title:"About OG Cupid",items:[
    {path:"/contact",label:"Contact",note:"Support, feedback and inquiries",access:"public"},
    {path:"/privacy",label:"Privacy Policy",note:"Data and privacy",access:"public"},
    {path:"/terms",label:"Terms & Conditions",note:"Terms of service",access:"public"},
    {path:"/sitemap",label:"Sitemap",note:"This page",access:"public"}
  ]},
  {title:"Administration",items:[
    {path:"/admin",label:"Admin controls",note:"Restricted to administrators",access:"admin"}
  ]}
].map(section=>Object.freeze({
  ...section,items:Object.freeze(section.items.map(item=>Object.freeze(item)))
})));

export const SITEMAP_PATHS=Object.freeze(SITEMAP_SECTIONS.flatMap(section=>
  section.items.map(item=>item.path)));
