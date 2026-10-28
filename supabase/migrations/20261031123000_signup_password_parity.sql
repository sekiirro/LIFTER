-- U3-R1: immutable Unicode 17.0 categories matching lib/auth/password-policy.ts.
-- Integer code-point classification is independent of LC_CTYPE/collation.
-- PostgreSQL UTF8 text rejects NUL (22021) before this helper can be invoked.
create function app_private.signup_password_acceptable(password text) returns boolean
language plpgsql immutable security definer set search_path='' as $$
declare
  -- BEGIN GENERATED UNICODE RANGES
  -- Unicode 17.0; all U+0000..U+10FFFF, half-open integer ranges.
  digit_ranges constant pg_catalog.int4multirange := '{[48,58),[1632,1642),[1776,1786),[1984,1994),[2406,2416),[2534,2544),[2662,2672),[2790,2800),[2918,2928),[3046,3056),[3174,3184),[3302,3312),[3430,3440),[3558,3568),[3664,3674),[3792,3802),[3872,3882),[4160,4170),[4240,4250),[6112,6122),[6160,6170),[6470,6480),[6608,6618),[6784,6794),[6800,6810),[6992,7002),[7088,7098),[7232,7242),[7248,7258),[42528,42538),[43216,43226),[43264,43274),[43472,43482),[43504,43514),[43600,43610),[44016,44026),[65296,65306),[66720,66730),[68912,68922),[68928,68938),[69734,69744),[69872,69882),[69942,69952),[70096,70106),[70384,70394),[70736,70746),[70864,70874),[71248,71258),[71360,71370),[71376,71396),[71472,71482),[71904,71914),[72016,72026),[72688,72698),[72784,72794),[73040,73050),[73120,73130),[73184,73194),[73552,73562),[90416,90426),[92768,92778),[92864,92874),[93008,93018),[93552,93562),[118000,118010),[120782,120832),[123200,123210),[123632,123642),[124144,124154),[124401,124411),[125264,125274),[130032,130042)}'::pg_catalog.int4multirange;
  symbol_ranges constant pg_catalog.int4multirange := '{[33,48),[58,65),[91,97),[123,127),[161,170),[171,173),[174,181),[182,186),[187,192),[215,216),[247,248),[706,710),[722,736),[741,748),[749,750),[751,880),[885,886),[894,895),[900,902),[903,904),[1014,1015),[1154,1162),[1370,1376),[1417,1419),[1421,1424),[1425,1480),[1523,1525),[1542,1564),[1565,1568),[1611,1632),[1642,1646),[1648,1649),[1748,1749),[1750,1757),[1758,1765),[1767,1774),[1789,1791),[1792,1806),[1809,1810),[1840,1867),[1958,1969),[2027,2036),[2038,2042),[2045,2048),[2070,2074),[2075,2084),[2085,2088),[2089,2094),[2096,2111),[2137,2140),[2142,2143),[2184,2185),[2199,2208),[2250,2274),[2275,2308),[2362,2365),[2366,2384),[2385,2392),[2402,2406),[2416,2417),[2433,2436),[2492,2493),[2494,2501),[2503,2505),[2507,2510),[2519,2520),[2530,2532),[2546,2556),[2557,2559),[2561,2564),[2620,2621),[2622,2627),[2631,2633),[2635,2638),[2641,2642),[2672,2674),[2677,2679),[2689,2692),[2748,2749),[2750,2758),[2759,2762),[2763,2766),[2786,2788),[2800,2802),[2810,2816),[2817,2820),[2876,2877),[2878,2885),[2887,2889),[2891,2894),[2901,2904),[2914,2916),[2928,2929),[2930,2936),[2946,2947),[3006,3011),[3014,3017),[3018,3022),[3031,3032),[3056,3067),[3072,3077),[3132,3133),[3134,3141),[3142,3145),[3146,3150),[3157,3159),[3170,3172),[3191,3200),[3201,3205),[3260,3261),[3262,3269),[3270,3273),[3274,3278),[3285,3287),[3298,3300),[3315,3316),[3328,3332),[3387,3389),[3390,3397),[3398,3401),[3402,3406),[3407,3408),[3415,3423),[3426,3428),[3440,3450),[3457,3460),[3530,3531),[3535,3541),[3542,3543),[3544,3552),[3570,3573),[3633,3634),[3636,3643),[3647,3648),[3655,3664),[3674,3676),[3761,3762),[3764,3773),[3784,3791),[3841,3872),[3882,3904),[3953,3976),[3981,3992),[3993,4029),[4030,4045),[4046,4059),[4139,4159),[4170,4176),[4182,4186),[4190,4193),[4194,4197),[4199,4206),[4209,4213),[4226,4238),[4239,4240),[4250,4256),[4347,4348),[4957,4989),[5008,5018),[5120,5121),[5741,5743),[5787,5789),[5867,5873),[5906,5910),[5938,5943),[5970,5972),[6002,6004),[6068,6103),[6104,6108),[6109,6110),[6128,6138),[6144,6158),[6159,6160),[6277,6279),[6313,6314),[6432,6444),[6448,6460),[6464,6465),[6468,6470),[6618,6619),[6622,6656),[6679,6684),[6686,6688),[6741,6751),[6752,6781),[6783,6784),[6816,6823),[6824,6830),[6832,6878),[6880,6892),[6912,6917),[6964,6981),[6990,6992),[7002,7043),[7073,7086),[7142,7156),[7164,7168),[7204,7224),[7227,7232),[7294,7296),[7360,7368),[7376,7401),[7405,7406),[7412,7413),[7415,7418),[7616,7680),[8125,8126),[8127,8130),[8141,8144),[8157,8160),[8173,8176),[8189,8191),[8208,8232),[8240,8287),[8304,8305),[8308,8319),[8320,8335),[8352,8386),[8400,8433),[8448,8450),[8451,8455),[8456,8458),[8468,8469),[8470,8473),[8478,8484),[8485,8486),[8487,8488),[8489,8490),[8494,8495),[8506,8508),[8512,8517),[8522,8526),[8527,8579),[8581,8588),[8592,9258),[9280,9291),[9312,11124),[11126,11264),[11493,11499),[11503,11506),[11513,11520),[11632,11633),[11647,11648),[11744,11823),[11824,11870),[11904,11930),[11931,12020),[12032,12246),[12272,12288),[12289,12293),[12295,12337),[12342,12347),[12349,12352),[12441,12445),[12448,12449),[12539,12540),[12688,12704),[12736,12774),[12783,12784),[12800,12831),[12832,13312),[19904,19968),[42128,42183),[42238,42240),[42509,42512),[42607,42623),[42654,42656),[42726,42744),[42752,42775),[42784,42786),[42889,42891),[43010,43011),[43014,43015),[43019,43020),[43043,43053),[43056,43066),[43124,43128),[43136,43138),[43188,43206),[43214,43216),[43232,43250),[43256,43259),[43260,43261),[43263,43264),[43302,43312),[43335,43348),[43359,43360),[43392,43396),[43443,43470),[43486,43488),[43493,43494),[43561,43575),[43587,43588),[43596,43598),[43612,43616),[43639,43642),[43643,43646),[43696,43697),[43698,43701),[43703,43705),[43710,43712),[43713,43714),[43742,43744),[43755,43762),[43765,43767),[43867,43868),[43882,43884),[44003,44014),[64286,64287),[64297,64298),[64434,64467),[64830,64848),[64912,64914),[64968,64976),[65020,65050),[65056,65107),[65108,65127),[65128,65132),[65281,65296),[65306,65313),[65339,65345),[65371,65382),[65504,65511),[65512,65519),[65532,65534),[65792,65795),[65799,65844),[65847,65935),[65936,65949),[65952,65953),[66000,66046),[66272,66300),[66336,66340),[66369,66370),[66378,66379),[66422,66427),[66463,66464),[66512,66518),[66927,66928),[67671,67680),[67703,67712),[67751,67760),[67835,67840),[67862,67868),[67871,67872),[67903,67904),[68028,68030),[68032,68048),[68050,68096),[68097,68100),[68101,68103),[68108,68112),[68152,68155),[68159,68169),[68176,68185),[68221,68224),[68253,68256),[68296,68297),[68325,68327),[68331,68343),[68409,68416),[68440,68448),[68472,68480),[68505,68509),[68521,68528),[68858,68864),[68900,68904),[68969,68975),[69006,69008),[69216,69247),[69291,69294),[69328,69337),[69370,69376),[69405,69415),[69446,69466),[69506,69514),[69573,69580),[69632,69635),[69688,69710),[69714,69734),[69744,69745),[69747,69749),[69759,69763),[69808,69821),[69822,69827),[69888,69891),[69927,69941),[69952,69956),[69957,69959),[70003,70006),[70016,70019),[70067,70081),[70085,70096),[70107,70108),[70109,70112),[70113,70133),[70188,70207),[70209,70210),[70313,70314),[70367,70379),[70400,70404),[70459,70461),[70462,70469),[70471,70473),[70475,70478),[70487,70488),[70498,70500),[70502,70509),[70512,70517),[70584,70593),[70594,70595),[70597,70598),[70599,70603),[70604,70609),[70610,70611),[70612,70614),[70615,70617),[70625,70627),[70709,70727),[70731,70736),[70746,70748),[70749,70751),[70832,70852),[70854,70855),[71087,71094),[71096,71128),[71132,71134),[71216,71236),[71264,71277),[71339,71352),[71353,71354),[71453,71468),[71482,71488),[71724,71740),[71914,71923),[71984,71990),[71991,71993),[71995,71999),[72000,72001),[72002,72007),[72145,72152),[72154,72161),[72162,72163),[72164,72165),[72193,72203),[72243,72250),[72251,72264),[72273,72284),[72330,72349),[72350,72355),[72448,72458),[72544,72552),[72673,72674),[72751,72759),[72760,72768),[72769,72774),[72794,72813),[72816,72818),[72850,72872),[72873,72887),[73009,73015),[73018,73019),[73020,73022),[73023,73030),[73031,73032),[73098,73103),[73104,73106),[73107,73112),[73459,73465),[73472,73474),[73475,73476),[73524,73531),[73534,73552),[73562,73563),[73664,73714),[73727,73728),[74752,74863),[74864,74869),[77809,77811),[78912,78913),[78919,78934),[90398,90416),[92782,92784),[92912,92918),[92976,92992),[92996,92998),[93019,93026),[93549,93552),[93824,93851),[94031,94032),[94033,94088),[94095,94099),[94178,94179),[94180,94181),[94192,94194),[94196,94199),[113820,113824),[117760,118000),[118010,118013),[118016,118452),[118458,118481),[118496,118513),[118528,118574),[118576,118599),[118608,118724),[118784,119030),[119040,119079),[119081,119155),[119163,119275),[119296,119366),[119488,119508),[119520,119540),[119552,119639),[119648,119673),[120513,120514),[120539,120540),[120571,120572),[120597,120598),[120629,120630),[120655,120656),[120687,120688),[120713,120714),[120745,120746),[120771,120772),[120832,121484),[121499,121504),[121505,121520),[122880,122887),[122888,122905),[122907,122914),[122915,122917),[122918,122923),[123023,123024),[123184,123191),[123215,123216),[123566,123567),[123628,123632),[123647,123648),[124140,124144),[124398,124400),[124415,124416),[124643,124644),[124646,124647),[124654,124656),[124661,124662),[125127,125143),[125252,125259),[125278,125280),[126065,126133),[126209,126270),[126704,126706),[126976,127020),[127024,127124),[127136,127151),[127153,127168),[127169,127184),[127185,127222),[127232,127406),[127462,127491),[127504,127548),[127552,127561),[127568,127570),[127584,127590),[127744,128729),[128732,128749),[128752,128765),[128768,128986),[128992,129004),[129008,129009),[129024,129036),[129040,129096),[129104,129114),[129120,129160),[129168,129198),[129200,129212),[129216,129218),[129232,129241),[129280,129624),[129632,129646),[129648,129661),[129664,129675),[129678,129735),[129736,129737),[129741,129757),[129759,129771),[129775,129785),[129792,129939),[129940,130032),[130042,130043),[917760,918000)}'::pg_catalog.int4multirange;
  -- END GENERATED UNICODE RANGES
  code_point integer;
  has_digit boolean := false;
  has_symbol boolean := false;
begin
  if password is null or pg_catalog.length(password)<8
    or pg_catalog.octet_length(password)>72 then return false; end if;
  -- ascii(text) returns the Unicode code point in a UTF8 database. Do not
  -- normalize or classify with locale-sensitive regex/character functions.
  for i in 1..pg_catalog.length(password) loop
    code_point := pg_catalog.ascii(pg_catalog.substr(password,i,1));
    has_digit := has_digit or code_point <@ digit_ranges;
    has_symbol := has_symbol or code_point <@ symbol_ranges;
    if has_digit and has_symbol then return true; end if;
  end loop;
  return false;
end
$$;
alter function app_private.signup_password_acceptable(text) owner to postgres;
revoke all on function app_private.signup_password_acceptable(text) from public,anon,authenticated,service_role;

create or replace function public.client_signup(token text, request_secret text, admission_ticket uuid, fields jsonb)
returns jsonb language plpgsql security definer set search_path='' as $signup$
declare
  link public.registration_links%rowtype;
  policy jsonb;
  required_fields jsonb;
  canonical record;
  password_hash text;
  v_token_hash text;
  binding bytea;
  rate_key text;
  sampled_at timestamptz;
  consumed uuid;
  new_user uuid;
  new_client uuid;
  failure_id uuid;
  cost integer;
  constraint_name text;
  error_message text;
begin
  -- This outer exception block is the transaction rollback boundary, including
  -- redemption and failure audit. Unknown errors never become business invalid.
  if not app_private.signup_auth_schema_compatible() then return '{"status":"unavailable"}'::jsonb; end if;
  if auth.uid() is not null then return '{"status":"invalid"}'::jsonb; end if;
  policy:=app_private.signup_password_policy();
  required_fields:=app_private.signup_field_contract()->'required';
  if policy is null or required_fields is null or app_private.signup_consumption_policy()->>'strict' is distinct from 'true'
    or app_private.signup_completion_policy()->>'state' is distinct from 'pending-approval' then
    return '{"status":"unavailable"}'::jsonb;
  end if;
  if fields is null or jsonb_typeof(fields)<>'object' then return '{"status":"invalid"}'::jsonb; end if;
  if exists(select 1 from jsonb_object_keys(fields) k where not required_fields ? k)
    or exists(select 1 from jsonb_array_elements_text(required_fields) k where jsonb_typeof(fields->k) is distinct from 'string' or length(btrim(fields->>k))=0) then
    return '{"status":"invalid"}'::jsonb;
  end if;
  if not app_private.signup_password_acceptable(fields->>'password') then
    return '{"status":"invalid"}'::jsonb;
  end if;
  begin
    select * into canonical from app_private.signup_identity_normalization(fields->>'email',fields->>'phone');
  exception when check_violation then
    if sqlerrm='unresolved_identifier' then return '{"status":"invalid"}'::jsonb; end if;
    raise;
  end;
  if canonical.email_key is null or canonical.phone_key is null then return '{"status":"invalid"}'::jsonb; end if;
  cost:=app_private.signup_bcrypt_cost();
  if cost is distinct from 10 then return '{"status":"unavailable"}'::jsonb; end if;
  -- Deliberately before ANY link/identity-state branching (including replay).
  password_hash:=extensions.crypt(fields->>'password',extensions.gen_salt('bf',cost));
  v_token_hash:=encode(extensions.digest(token,'sha256'),'hex');
  select * into link from public.registration_links l where l.token_hash=v_token_hash for update;
  sampled_at:=clock_timestamp();
  -- Vault absence is infrastructure, never a link-state result.
  select s.decrypted_secret into rate_key from vault.decrypted_secrets s where s.name='SIGNUP_RATE_KEY';
  if rate_key is null or rate_key !~ '^[0-9a-f]{64}$' then raise exception 'signup_unavailable' using errcode='55000'; end if;
  binding:=extensions.hmac(convert_to('lifter.f11.link.v1','UTF8')||decode('00','hex')||int4send(octet_length(v_token_hash))||convert_to(v_token_hash,'UTF8'),decode(rate_key,'hex'),'sha256');
  if not app_private.redeem_signup_admission_ticket(admission_ticket,binding,extensions.digest(request_secret,'sha256'),link.workspace_id,link.id) then
    return '{"status":"invalid"}'::jsonb;
  end if;
  begin
    if token is null or token !~ '^[A-Za-z0-9_-]{43}$' or request_secret is null or request_secret !~ '^[A-Za-z0-9_-]{43,}$'
      or link.id is null or link.consumed_at is not null or sampled_at>=link.expires_at then
      raise exception 'signup_invalid' using errcode='P1100';
    end if;
    new_user:=gen_random_uuid();
    perform app_private.signup_lock_identity_keys(new_user,array['email:'||canonical.email_key,'phone:'||canonical.phone_key]);
    -- Email/password account, confirmed by this bounded flow, no phone login
    -- identifier or session. U2 client trigger adds the canonical phone claim.
    insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,invited_at,
      confirmation_token,confirmation_sent_at,recovery_token,recovery_sent_at,email_change_token_new,email_change,email_change_sent_at,
      last_sign_in_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,phone,phone_confirmed_at,phone_change,phone_change_token,
      phone_change_sent_at,email_change_token_current,email_change_confirm_status,banned_until,reauthentication_token,
      reauthentication_sent_at,is_sso_user,deleted_at,is_anonymous)
    values('00000000-0000-0000-0000-000000000000',new_user,'authenticated','authenticated',canonical.email_key,password_hash,sampled_at,null,
      '',null,'',null,'','',null,null,'{"provider":"email","providers":["email"]}'::jsonb,'{"email_verified":true}'::jsonb,
      sampled_at,sampled_at,null,null,'','',null,'',0,null,'',null,false,null,false);
    insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
    values(gen_random_uuid(),new_user::text,new_user,jsonb_build_object('sub',new_user::text,'email',canonical.email_key,'email_verified',false,'phone_verified',false),
      'email',sampled_at,sampled_at,sampled_at);
    insert into public.clients(workspace_id,auth_user_id,registration_link_id,package_version_id,email_normalized,phone_e164,name)
    values(link.workspace_id,new_user,link.id,link.package_version_id,canonical.email_key,canonical.phone_key,fields->>'name') returning id into new_client;
    sampled_at:=clock_timestamp();
    update public.registration_links l set consumed_at=sampled_at
      where l.id=link.id and l.workspace_id=link.workspace_id and l.consumed_at is null and sampled_at<l.expires_at returning l.id into consumed;
    if consumed is null then raise exception 'signup_invalid' using errcode='P1100'; end if;
    insert into app_private.client_signup_operations(workspace_id,client_id,auth_user_id,registration_link_id,request_secret_hash)
      values(link.workspace_id,new_client,new_user,link.id,extensions.digest(request_secret,'sha256'));
    set constraints all immediate;
    return '{"status":"complete"}'::jsonb;
  exception when others then
    get stacked diagnostics constraint_name=CONSTRAINT_NAME,error_message=MESSAGE_TEXT;
    -- Positively identified business failures only. No diagnostics are logged,
    -- persisted, raised to the caller, or included in public return values.
    if not (sqlstate='P1100'
      or (sqlstate='23505' and constraint_name in ('account_identifier_claims_email_key_key','account_identifier_claims_phone_key_key',
        'clients_email_normalized_key','clients_phone_e164_key','clients_registration_link_id_key'))
      or (sqlstate='23514' and error_message in ('unresolved_identifier','invalid_client_binding','identifier_disagreement',
        'identity_kind_conflict','invalid_client_correspondence','invalid_receipt_binding'))) then
      raise exception 'signup_unavailable' using errcode='55000';
    end if;
  end;
  -- Business subtransaction was rolled back; redemption survives. Failure
  -- evidence has its own UUID and never uses a ticket/credential as audit target.
  insert into app_private.client_signup_attempts(outcome_class,workspace_id,link_id)
    values('failure',link.workspace_id,link.id) returning id into failure_id;
  insert into public.audit_events(actor_user_id,action,target_table,target_id,workspace_id,details)
    values(null,'client.signup_failed','client_signup_attempts',failure_id,link.workspace_id,
      jsonb_strip_nulls(jsonb_build_object('outcome_class','failure','timestamp',clock_timestamp(),'link_id',link.id,'workspace_id',link.workspace_id)));
  return '{"status":"invalid"}'::jsonb;
exception when others then
  return '{"status":"unavailable"}'::jsonb;
end;
$signup$;
alter function public.client_signup(text,text,uuid,jsonb) owner to postgres;
revoke all on function public.client_signup(text,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.client_signup(text,text,uuid,jsonb) to anon,authenticated;
