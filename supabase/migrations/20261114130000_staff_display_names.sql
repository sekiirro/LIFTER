-- F21 T001-T004, T011, T013: server-owned, normalized staff display names.
alter table public.staff_profiles
  add column display_name text,
  add column display_name_version integer not null default 0
    check (display_name_version >= 0);

create function app_private.staff_display_name_is_white_space(code_point integer)
returns boolean
language sql immutable parallel safe set search_path = '' as $$
  select code_point between 9 and 13
    or code_point in (32, 133, 160, 5760, 8232, 8233, 8239, 8287, 12288)
    or code_point between 8192 and 8202
$$;
alter function app_private.staff_display_name_is_white_space(integer) owner to postgres;
revoke all on function app_private.staff_display_name_is_white_space(integer)
  from public, anon, service_role;

create function app_private.normalize_staff_display_name(input_name text)
returns text
language plpgsql immutable strict parallel safe set search_path = '' as $$
declare
  first_position integer := 1;
  last_position integer := char_length(input_name);
  code_point integer;
  trimmed_name text;
begin
  while first_position <= last_position loop
    code_point := ascii(substring(input_name from first_position for 1));
    exit when not app_private.staff_display_name_is_white_space(code_point);
    first_position := first_position + 1;
  end loop;
  while last_position >= first_position loop
    code_point := ascii(substring(input_name from last_position for 1));
    exit when not app_private.staff_display_name_is_white_space(code_point);
    last_position := last_position - 1;
  end loop;
  if first_position > last_position then return ''; end if;
  trimmed_name := substring(input_name from first_position for last_position - first_position + 1);
  return normalize(trimmed_name, NFC);
end;
$$;
alter function app_private.normalize_staff_display_name(text) owner to postgres;
revoke all on function app_private.normalize_staff_display_name(text)
  from public, anon, authenticated, service_role;

create function app_private.staff_display_name_is_valid(input_name text)
returns boolean
language plpgsql immutable strict parallel safe set search_path = '' as $$
declare
  code_point integer;
  char_position integer;
  allowed_letter_mark_ranges int4multirange :=
/* GENERATED_STAFF_NAME_UNICODE_RANGES_BEGIN */
  '{[65,91),[97,123),[170,171),[181,182),[186,187),[192,215),[216,247),[248,706),[710,722),[736,741),[748,749),[750,751),[768,885),[886,888),[890,894),[895,896),[902,903),[904,907),[908,909),[910,930),[931,1014),[1015,1154),[1155,1328),[1329,1367),[1369,1370),[1376,1417),[1425,1470),[1471,1472),[1473,1475),[1476,1478),[1479,1480),[1488,1515),[1519,1523),[1552,1563),[1568,1632),[1646,1748),[1749,1757),[1759,1769),[1770,1776),[1786,1789),[1791,1792),[1808,1867),[1869,1970),[1994,2038),[2042,2043),[2045,2046),[2048,2094),[2112,2140),[2144,2155),[2160,2184),[2185,2192),[2199,2274),[2275,2404),[2417,2436),[2437,2445),[2447,2449),[2451,2473),[2474,2481),[2482,2483),[2486,2490),[2492,2501),[2503,2505),[2507,2511),[2519,2520),[2524,2526),[2527,2532),[2544,2546),[2556,2557),[2558,2559),[2561,2564),[2565,2571),[2575,2577),[2579,2601),[2602,2609),[2610,2612),[2613,2615),[2616,2618),[2620,2621),[2622,2627),[2631,2633),[2635,2638),[2641,2642),[2649,2653),[2654,2655),[2672,2678),[2689,2692),[2693,2702),[2703,2706),[2707,2729),[2730,2737),[2738,2740),[2741,2746),[2748,2758),[2759,2762),[2763,2766),[2768,2769),[2784,2788),[2809,2816),[2817,2820),[2821,2829),[2831,2833),[2835,2857),[2858,2865),[2866,2868),[2869,2874),[2876,2885),[2887,2889),[2891,2894),[2901,2904),[2908,2910),[2911,2916),[2929,2930),[2946,2948),[2949,2955),[2958,2961),[2962,2966),[2969,2971),[2972,2973),[2974,2976),[2979,2981),[2984,2987),[2990,3002),[3006,3011),[3014,3017),[3018,3022),[3024,3025),[3031,3032),[3072,3085),[3086,3089),[3090,3113),[3114,3130),[3132,3141),[3142,3145),[3146,3150),[3157,3159),[3160,3163),[3164,3166),[3168,3172),[3200,3204),[3205,3213),[3214,3217),[3218,3241),[3242,3252),[3253,3258),[3260,3269),[3270,3273),[3274,3278),[3285,3287),[3292,3295),[3296,3300),[3313,3316),[3328,3341),[3342,3345),[3346,3397),[3398,3401),[3402,3407),[3412,3416),[3423,3428),[3450,3456),[3457,3460),[3461,3479),[3482,3506),[3507,3516),[3517,3518),[3520,3527),[3530,3531),[3535,3541),[3542,3543),[3544,3552),[3570,3572),[3585,3643),[3648,3663),[3713,3715),[3716,3717),[3718,3723),[3724,3748),[3749,3750),[3751,3774),[3776,3781),[3782,3783),[3784,3791),[3804,3808),[3840,3841),[3864,3866),[3893,3894),[3895,3896),[3897,3898),[3902,3912),[3913,3949),[3953,3973),[3974,3992),[3993,4029),[4038,4039),[4096,4160),[4176,4240),[4250,4254),[4256,4294),[4295,4296),[4301,4302),[4304,4347),[4348,4681),[4682,4686),[4688,4695),[4696,4697),[4698,4702),[4704,4745),[4746,4750),[4752,4785),[4786,4790),[4792,4799),[4800,4801),[4802,4806),[4808,4823),[4824,4881),[4882,4886),[4888,4955),[4957,4960),[4992,5008),[5024,5110),[5112,5118),[5121,5741),[5743,5760),[5761,5787),[5792,5867),[5873,5881),[5888,5910),[5919,5941),[5952,5972),[5984,5997),[5998,6001),[6002,6004),[6016,6100),[6103,6104),[6108,6110),[6155,6158),[6159,6160),[6176,6265),[6272,6315),[6320,6390),[6400,6431),[6432,6444),[6448,6460),[6480,6510),[6512,6517),[6528,6572),[6576,6602),[6656,6684),[6688,6751),[6752,6781),[6783,6784),[6823,6824),[6832,6878),[6880,6892),[6912,6989),[7019,7028),[7040,7088),[7098,7156),[7168,7224),[7245,7248),[7258,7294),[7296,7307),[7312,7355),[7357,7360),[7376,7379),[7380,7419),[7424,7958),[7960,7966),[7968,8006),[8008,8014),[8016,8024),[8025,8026),[8027,8028),[8029,8030),[8031,8062),[8064,8117),[8118,8125),[8126,8127),[8130,8133),[8134,8141),[8144,8148),[8150,8156),[8160,8173),[8178,8181),[8182,8189),[8305,8306),[8319,8320),[8336,8349),[8400,8433),[8450,8451),[8455,8456),[8458,8468),[8469,8470),[8473,8478),[8484,8485),[8486,8487),[8488,8489),[8490,8494),[8495,8506),[8508,8512),[8517,8522),[8526,8527),[8579,8581),[11264,11493),[11499,11508),[11520,11558),[11559,11560),[11565,11566),[11568,11624),[11631,11632),[11647,11671),[11680,11687),[11688,11695),[11696,11703),[11704,11711),[11712,11719),[11720,11727),[11728,11735),[11736,11743),[11744,11776),[11823,11824),[12293,12295),[12330,12336),[12337,12342),[12347,12349),[12353,12439),[12441,12443),[12445,12448),[12449,12539),[12540,12544),[12549,12592),[12593,12687),[12704,12736),[12784,12800),[13312,19904),[19968,42125),[42192,42238),[42240,42509),[42512,42528),[42538,42540),[42560,42611),[42612,42622),[42623,42726),[42736,42738),[42775,42784),[42786,42889),[42891,42973),[42993,43048),[43052,43053),[43072,43124),[43136,43206),[43232,43256),[43259,43260),[43261,43264),[43274,43310),[43312,43348),[43360,43389),[43392,43457),[43471,43472),[43488,43504),[43514,43519),[43520,43575),[43584,43598),[43616,43639),[43642,43715),[43739,43742),[43744,43760),[43762,43767),[43777,43783),[43785,43791),[43793,43799),[43808,43815),[43816,43823),[43824,43867),[43868,43882),[43888,44011),[44012,44014),[44032,55204),[55216,55239),[55243,55292),[63744,64110),[64112,64218),[64256,64263),[64275,64280),[64285,64297),[64298,64311),[64312,64317),[64318,64319),[64320,64322),[64323,64325),[64326,64434),[64467,64830),[64848,64912),[64914,64968),[65008,65020),[65024,65040),[65056,65072),[65136,65141),[65142,65277),[65313,65339),[65345,65371),[65382,65471),[65474,65480),[65482,65488),[65490,65496),[65498,65501),[65536,65548),[65549,65575),[65576,65595),[65596,65598),[65599,65614),[65616,65630),[65664,65787),[66045,66046),[66176,66205),[66208,66257),[66272,66273),[66304,66336),[66349,66369),[66370,66378),[66384,66427),[66432,66462),[66464,66500),[66504,66512),[66560,66718),[66736,66772),[66776,66812),[66816,66856),[66864,66916),[66928,66939),[66940,66955),[66956,66963),[66964,66966),[66967,66978),[66979,66994),[66995,67002),[67003,67005),[67008,67060),[67072,67383),[67392,67414),[67424,67432),[67456,67462),[67463,67505),[67506,67515),[67584,67590),[67592,67593),[67594,67638),[67639,67641),[67644,67645),[67647,67670),[67680,67703),[67712,67743),[67808,67827),[67828,67830),[67840,67862),[67872,67898),[67904,67930),[67968,68024),[68030,68032),[68096,68100),[68101,68103),[68108,68116),[68117,68120),[68121,68150),[68152,68155),[68159,68160),[68192,68221),[68224,68253),[68288,68296),[68297,68327),[68352,68406),[68416,68438),[68448,68467),[68480,68498),[68608,68681),[68736,68787),[68800,68851),[68864,68904),[68938,68966),[68969,68974),[68975,68998),[69248,69290),[69291,69293),[69296,69298),[69314,69320),[69370,69405),[69415,69416),[69424,69457),[69488,69510),[69552,69573),[69600,69623),[69632,69703),[69744,69750),[69759,69819),[69826,69827),[69840,69865),[69888,69941),[69956,69960),[69968,70004),[70006,70007),[70016,70085),[70089,70093),[70094,70096),[70106,70107),[70108,70109),[70144,70162),[70163,70200),[70206,70210),[70272,70279),[70280,70281),[70282,70286),[70287,70302),[70303,70313),[70320,70379),[70400,70404),[70405,70413),[70415,70417),[70419,70441),[70442,70449),[70450,70452),[70453,70458),[70459,70469),[70471,70473),[70475,70478),[70480,70481),[70487,70488),[70493,70500),[70502,70509),[70512,70517),[70528,70538),[70539,70540),[70542,70543),[70544,70582),[70583,70593),[70594,70595),[70597,70598),[70599,70603),[70604,70612),[70625,70627),[70656,70731),[70750,70754),[70784,70854),[70855,70856),[71040,71094),[71096,71105),[71128,71134),[71168,71233),[71236,71237),[71296,71353),[71424,71451),[71453,71468),[71488,71495),[71680,71739),[71840,71904),[71935,71943),[71945,71946),[71948,71956),[71957,71959),[71960,71990),[71991,71993),[71995,72004),[72096,72104),[72106,72152),[72154,72162),[72163,72165),[72192,72255),[72263,72264),[72272,72346),[72349,72350),[72368,72441),[72544,72552),[72640,72673),[72704,72713),[72714,72759),[72760,72769),[72818,72848),[72850,72872),[72873,72887),[72960,72967),[72968,72970),[72971,73015),[73018,73019),[73020,73022),[73023,73032),[73056,73062),[73063,73065),[73066,73103),[73104,73106),[73107,73113),[73136,73180),[73440,73463),[73472,73489),[73490,73531),[73534,73539),[73562,73563),[73648,73649),[73728,74650),[74880,75076),[77712,77809),[77824,78896),[78912,78934),[78944,82939),[82944,83527),[90368,90416),[92160,92729),[92736,92767),[92784,92863),[92880,92910),[92912,92917),[92928,92983),[92992,92996),[93027,93048),[93053,93072),[93504,93549),[93760,93824),[93856,93881),[93883,93908),[93952,94027),[94031,94088),[94095,94112),[94176,94178),[94179,94181),[94192,94196),[94208,101590),[101631,101663),[101760,101875),[110576,110580),[110581,110588),[110589,110591),[110592,110883),[110898,110899),[110928,110931),[110933,110934),[110948,110952),[110960,111356),[113664,113771),[113776,113789),[113792,113801),[113808,113818),[113821,113823),[118528,118574),[118576,118599),[119141,119146),[119149,119155),[119163,119171),[119173,119180),[119210,119214),[119362,119365),[119808,119893),[119894,119965),[119966,119968),[119970,119971),[119973,119975),[119977,119981),[119982,119994),[119995,119996),[119997,120004),[120005,120070),[120071,120075),[120077,120085),[120086,120093),[120094,120122),[120123,120127),[120128,120133),[120134,120135),[120138,120145),[120146,120486),[120488,120513),[120514,120539),[120540,120571),[120572,120597),[120598,120629),[120630,120655),[120656,120687),[120688,120713),[120714,120745),[120746,120771),[120772,120780),[121344,121399),[121403,121453),[121461,121462),[121476,121477),[121499,121504),[121505,121520),[122624,122655),[122661,122667),[122880,122887),[122888,122905),[122907,122914),[122915,122917),[122918,122923),[122928,122990),[123023,123024),[123136,123181),[123184,123198),[123214,123215),[123536,123567),[123584,123632),[124112,124144),[124368,124401),[124608,124639),[124640,124662),[124670,124672),[124896,124903),[124904,124908),[124909,124911),[124912,124927),[124928,125125),[125136,125143),[125184,125260),[126464,126468),[126469,126496),[126497,126499),[126500,126501),[126503,126504),[126505,126515),[126516,126520),[126521,126522),[126523,126524),[126530,126531),[126535,126536),[126537,126538),[126539,126540),[126541,126544),[126545,126547),[126548,126549),[126551,126552),[126553,126554),[126555,126556),[126557,126558),[126559,126560),[126561,126563),[126564,126565),[126567,126571),[126572,126579),[126580,126584),[126585,126589),[126590,126591),[126592,126602),[126603,126620),[126625,126628),[126629,126634),[126635,126652),[131072,173792),[173824,178206),[178208,183982),[183984,191457),[191472,192094),[194560,195102),[196608,201547),[201552,210042),[917760,918000)}'::int4multirange/* GENERATED_STAFF_NAME_UNICODE_RANGES_END */;
begin
  if input_name is not NFC NORMALIZED
    or char_length(input_name) not between 1 and 80 then
    return false;
  end if;
  for char_position in 1..char_length(input_name) loop
    code_point := ascii(substring(input_name from char_position for 1));
    if code_point in (32, 39, 45, 46) then continue; end if;
    if not (code_point <@ allowed_letter_mark_ranges) then return false; end if;
  end loop;
  return true;
end;
$$;
alter function app_private.staff_display_name_is_valid(text) owner to postgres;
revoke all on function app_private.staff_display_name_is_valid(text)
  from public, anon, service_role;
grant execute on function app_private.staff_display_name_is_valid(text)
  to authenticated, service_role;

alter table public.staff_profiles
  add constraint staff_profiles_display_name_valid
  check (display_name is null or app_private.staff_display_name_is_valid(display_name));

create function app_private.guard_staff_display_name()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.display_name is null then
      raise exception 'staff_display_name_required' using errcode = '23514';
    end if;
    new.display_name := app_private.normalize_staff_display_name(new.display_name);
    if not app_private.staff_display_name_is_valid(new.display_name) then
      raise exception 'staff_display_name_invalid' using errcode = '22023';
    end if;
    new.display_name_version := 1;
  else
    if new.user_id is distinct from old.user_id
      or new.role is distinct from old.role
      or new.created_at is distinct from old.created_at then
      new.display_name := old.display_name;
      new.display_name_version := old.display_name_version;
    elsif new.display_name is distinct from old.display_name then
      if new.display_name is null then
        raise exception 'staff_display_name_required' using errcode = '23514';
      end if;
      new.display_name := app_private.normalize_staff_display_name(new.display_name);
      if not app_private.staff_display_name_is_valid(new.display_name) then
        raise exception 'staff_display_name_invalid' using errcode = '22023';
      end if;
      new.display_name_version := old.display_name_version + 1;
    else
      new.display_name_version := old.display_name_version;
    end if;
  end if;
  return new;
end;
$$;
alter function app_private.guard_staff_display_name() owner to postgres;
revoke all on function app_private.guard_staff_display_name()
  from public, anon, authenticated, service_role;
create trigger staff_profiles_guard_display_name
  before insert or update on public.staff_profiles
  for each row execute function app_private.guard_staff_display_name();

create function app_private.can_read_staff_display_name(target_user_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    app_private.is_platform_owner()
    or (
      app_private.current_staff_role() in (
        'workspace_owner'::public.staff_role,
        'trainer'::public.staff_role
      )
      and exists (
        select 1 from public.workspace_memberships target_membership
        where target_membership.user_id = target_user_id
          and target_membership.revoked_at is null
          and app_private.has_workspace_access(target_membership.workspace_id, 'coaching_work')
      )
    )
  )
$$;
alter function app_private.can_read_staff_display_name(uuid) owner to postgres;
revoke all on function app_private.can_read_staff_display_name(uuid)
  from public, anon, service_role;

create function app_private.can_write_staff_display_name(target_user_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    app_private.is_platform_owner()
    or (
      app_private.current_staff_role() = 'workspace_owner'::public.staff_role
      and exists (
        select 1
        from public.workspace_memberships target_membership
        join public.workspace_memberships actor_membership
          on actor_membership.workspace_id = target_membership.workspace_id
          and actor_membership.user_id = auth.uid()
          and actor_membership.revoked_at is null
        where target_membership.user_id = target_user_id
          and target_membership.revoked_at is null
      )
      and not exists (
        select 1 from public.workspace_memberships target_membership
        where target_membership.user_id = target_user_id
          and target_membership.revoked_at is null
          and not exists (
            select 1 from public.workspace_memberships actor_membership
            where actor_membership.workspace_id = target_membership.workspace_id
              and actor_membership.user_id = auth.uid()
              and actor_membership.revoked_at is null
          )
      )
    )
  )
$$;
alter function app_private.can_write_staff_display_name(uuid) owner to postgres;
revoke all on function app_private.can_write_staff_display_name(uuid)
  from public, anon, service_role;

create function public.get_staff_display_name(p_target_user_id uuid)
returns text
language plpgsql stable security definer set search_path = '' as $$
declare result_name text;
begin
  if p_target_user_id is null
    or not app_private.can_read_staff_display_name(p_target_user_id) then
    raise exception 'staff_display_name_denied' using errcode = '42501';
  end if;
  select display_name into result_name
  from public.staff_profiles where user_id = p_target_user_id;
  return result_name;
end;
$$;
alter function public.get_staff_display_name(uuid) owner to postgres;
revoke all on function public.get_staff_display_name(uuid) from public, anon, service_role;
grant execute on function public.get_staff_display_name(uuid) to authenticated;

create function public.set_staff_display_name(
  p_target_user_id uuid,
  p_display_name text,
  p_expected_version integer,
  p_request_key uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.staff_role;
  normalized_name text;
  current_version integer;
  result_status jsonb;
  request_fingerprint text;
  audit_workspace_id uuid;
  inserted_key integer;
begin
  if actor_id is null or p_target_user_id is null
    or p_expected_version is null or p_expected_version < 0
    or p_request_key is null
    or substring(p_request_key::text from 15 for 1) <> '4'
    or substring(p_request_key::text from 20 for 1) not in ('8', '9', 'a', 'b') then
    raise exception 'staff_display_name_request_invalid' using errcode = '22023';
  end if;
  if not app_private.can_write_staff_display_name(p_target_user_id) then
    raise exception 'staff_display_name_denied' using errcode = '42501';
  end if;
  normalized_name := app_private.normalize_staff_display_name(p_display_name);
  if normalized_name is null
    or not app_private.staff_display_name_is_valid(normalized_name) then
    raise exception 'staff_display_name_invalid' using errcode = '22023';
  end if;
  select role into actor_role from public.staff_profiles where user_id = actor_id;
  request_fingerprint := 'sha256:' || encode(extensions.digest(
    convert_to(jsonb_build_array(p_target_user_id, normalized_name, p_expected_version)::text, 'UTF8'),
    'sha256'
  ), 'hex');

  result_status := app_private.operation_key_result(
    actor_id, 'staff_display_names.set', p_request_key, request_fingerprint
  );
  if result_status is not null then return result_status; end if;

  insert into app_private.operation_keys(actor_user_id, action, operation_key, request_hash)
  values (actor_id, 'staff_display_names.set', p_request_key, request_fingerprint)
  on conflict (actor_user_id, operation_key) do nothing;
  get diagnostics inserted_key = row_count;
  if inserted_key = 0 then
    return app_private.operation_key_result(
      actor_id, 'staff_display_names.set', p_request_key, request_fingerprint
    );
  end if;

  select display_name_version into current_version
  from public.staff_profiles where user_id = p_target_user_id for update;
  if not found then
    raise exception 'staff_display_name_denied' using errcode = '42501';
  end if;
  if current_version is distinct from p_expected_version then
    result_status := jsonb_build_object('status', 'conflict');
  else
    update public.staff_profiles set display_name = normalized_name
    where user_id = p_target_user_id;
    if actor_role = 'workspace_owner'::public.staff_role then
      select target_membership.workspace_id into audit_workspace_id
      from public.workspace_memberships target_membership
      join public.workspace_memberships actor_membership
        on actor_membership.workspace_id = target_membership.workspace_id
        and actor_membership.user_id = actor_id
        and actor_membership.revoked_at is null
      where target_membership.user_id = p_target_user_id
        and target_membership.revoked_at is null
      order by target_membership.workspace_id
      limit 1;
    else
      select workspace_id into audit_workspace_id
      from public.workspace_memberships
      where user_id = p_target_user_id and revoked_at is null
      order by workspace_id
      limit 1;
    end if;
    insert into public.audit_events(
      actor_user_id, action, target_table, target_id, workspace_id, details
    ) values (
      actor_id, 'staff.display_name_changed', 'staff_profiles',
      p_target_user_id, audit_workspace_id, '{}'::jsonb
    );
    result_status := jsonb_build_object('status', 'ok');
  end if;
  update app_private.operation_keys set result = result_status
  where actor_user_id = actor_id and operation_key = p_request_key;
  return result_status;
end;
$$;
alter function public.set_staff_display_name(uuid, text, integer, uuid) owner to postgres;
revoke all on function public.set_staff_display_name(uuid, text, integer, uuid)
  from public, anon, service_role;
grant execute on function public.set_staff_display_name(uuid, text, integer, uuid)
  to authenticated;

-- Keep profile reads limited to role and identity columns. Names are returned only by the scoped RPC.
revoke select on public.staff_profiles from authenticated;
grant select (user_id, role, created_at) on public.staff_profiles to authenticated;
revoke update on public.staff_profiles from authenticated, service_role;
grant update (role) on public.staff_profiles to authenticated, service_role;

comment on column public.staff_profiles.display_name is
  'Single server-owned AR/EN staff display name; null only for pre-existing rows awaiting backfill.';
comment on function public.set_staff_display_name(uuid, text, integer, uuid) is
  'Authorized name mutation with expected-version conflict, content-free operation key and metadata-only audit.';
