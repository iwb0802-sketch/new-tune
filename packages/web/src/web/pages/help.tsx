import { useState } from "react";
import {
  Radio,
  FlaskConical,
  Activity,
  LineChart,
  Settings as SettingsIcon,
  Info,
  ImageIcon,
} from "lucide-react";
import { colors, Fonts } from "../lib/theme";

/**
 * 사용설명서 (도움말) 페이지.
 * 대상: 일반 사용자 + 전문 조율사 (기본/심화 동시 수록)
 * 다루는 내용: 앱 소개 · 시험용(구버전) 스트로브 사용법 · 대표건반 측정/조율 커브 원리
 *
 * 스크린샷은 packages/web/public/help/ 에 넣고 아래 Figure 의 src 로 참조한다.
 * 이미지가 아직 없으면 자동으로 "스크린샷 자리" 플레이스홀더가 표시된다.
 */

const SECTIONS = [
  { id: "intro", label: "앱 소개" },
  { id: "strobe", label: "시험용 스트로브" },
  { id: "measure", label: "대표건반 · 커브" },
] as const;

export default function HelpPage() {
  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 20 }}>
      {/* 헤더 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 2, color: colors.mutedForeground }}>
          USER GUIDE
        </span>
        <h1 style={{ fontFamily: Fonts.sansBold, fontWeight: 700, fontSize: 24, color: colors.foreground, margin: 0 }}>
          사용설명서
        </h1>
        <p style={{ fontFamily: Fonts.sans, fontSize: 13, lineHeight: 1.6, color: colors.mutedForeground, margin: "4px 0 0" }}>
          피아노 조율 앱의 사용법과 조율 커브 원리를 정리했습니다. 조율 입문자와 전문 조율사 모두를 위한
          <b style={{ color: colors.foreground }}> 기본 · 심화 </b>
          설명을 함께 담았습니다.
        </p>
      </div>

      {/* 섹션 바로가기 */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            style={{
              padding: "7px 14px",
              borderRadius: 999,
              border: `1px solid ${colors.border}`,
              backgroundColor: colors.card,
              color: colors.foreground,
              fontFamily: Fonts.sansMedium,
              fontWeight: 500,
              fontSize: 12,
              textDecoration: "none",
            }}
          >
            {s.label}
          </a>
        ))}
      </div>

      {/* ── 1. 앱 소개 ─────────────────────────────── */}
      <Section id="intro" title="앱 소개" kicker="OVERVIEW">
        <p style={p}>
          이 앱은 실시간 피치 감지와 스트로브 튜너를 결합한 피아노 전용 조율 도구입니다. 마이크로 들어온
          소리에서 기본음을 찾아내고, 88건반 전체의 인하모니시티(배음의 어긋남)를 반영한 조율 커브를 만들어
          음마다 목표 주파수를 제시합니다.
        </p>

        <p style={{ ...p, marginBottom: 8 }}>화면 아래 탭으로 기능이 나뉩니다.</p>
        <FeatureRow Icon={Radio} name="튜너" desc="실시간 자동 감지. 소리를 내면 음을 인식하고 현재 오차(cents)를 보여줍니다." />
        <FeatureRow Icon={FlaskConical} name="시험" desc="스트로브 방식 수동 조율. 음을 직접 고르고 회전 패턴으로 미세 오차를 봅니다." />
        <FeatureRow Icon={Activity} name="측정" desc="대표건반 10개를 측정해 그 피아노만의 조율 커브를 만듭니다." />
        <FeatureRow Icon={LineChart} name="커브" desc="완성된 88건반 조율 커브를 그래프로 확인합니다." />
        <FeatureRow Icon={SettingsIcon} name="설정" desc="기준음(A4), 스트레치 스타일, 계정/역할을 관리합니다." />

        <Callout>
          <b>심화</b> — 자동(튜너)은 YIN + HPS로 기본음을 잡고, 시험(스트로브)은 선택한 음의 목표 주파수에
          위상을 맞춰 회전 무늬로 표시합니다. 둘 다 같은 조율 커브(목표값)를 기준으로 오차를 계산하므로,
          어느 탭에서 조율해도 결과가 일관됩니다.
        </Callout>
      </Section>

      {/* ── 2. 시험용(구버전) 스트로브 사용법 ──────────── */}
      <Section id="strobe" title="시험용(구버전) 스트로브 사용법" kicker="STROBE TUNER">
        <p style={p}>
          스트로브 튜너는 회전하는 줄무늬로 음의 오차를 보여줍니다. 무늬가 <b style={{ color: colors.foreground }}>멈추면 정확</b>,
          오른쪽으로 흐르면 음이 높고, 왼쪽으로 흐르면 낮습니다. 구버전은 색 구분 없이 빨간색 무늬로 통일된
          오리지널 방식입니다.
        </p>

        <Figure src="/help/strobe-overview.png?v=1" caption="시험용(구버전) 스트로브 전체 화면" />

        <Steps
          items={[
            "상단에서 조율할 음(건반)을 선택합니다.",
            "마이크를 켜면 소리가 자동으로 추적됩니다. (Pro 이상 등급)",
            "해당 건반을 치고 스트로브 무늬를 봅니다.",
            "무늬가 오른쪽으로 흐르면 핀을 조금 풀고, 왼쪽으로 흐르면 조입니다.",
            "무늬가 완전히 멈추면 그 음은 조율 완료입니다.",
          ]}
        />

        <Figure src="/help/strobe-cents.png?v=1" caption="cents 오차 표시 — 0에 가까울수록 정확" />

        <Callout>
          <b>심화</b> — 스트로브는 화면 갱신 주파수를 목표 주파수의 정수배에 동기화해 위상차를 시각화합니다.
          미터 방식보다 미세한 맥놀이(beat)를 눈으로 잡기 좋아, 유니즌·옥타브의 마지막 다듬기에 유리합니다.
          AUTO 추적 중에는 감지된 음을 그대로 반영하니, 값을 고정하고 싶으면 표시된 값을 눌러 수동으로 잡아둘 수 있습니다.
        </Callout>

        <p style={p}>
          조율이 끝나면 성명을 입력해 PDF로 내보낼 수 있고, 피아노별로 이름을 지정해 세션을 구분해
          저장할 수 있습니다.
        </p>
        <Figure src="/help/strobe-export.png?v=1" caption="성명 입력 후 PDF 내보내기" />
      </Section>

      {/* ── 3. 대표건반 측정 & 조율 커브 원리 ──────────── */}
      <Section id="measure" title="대표건반 측정 & 조율 커브 원리" kicker="STRETCH CURVE">
        <p style={p}>
          피아노마다 현의 굵기·장력이 달라 배음이 이상적인 정수배에서 조금씩 어긋납니다(인하모니시티).
          그래서 88건반을 전부 측정하지 않고, <b style={{ color: colors.foreground }}>대표 건반 10개</b>만 재서 그 피아노만의
          곡선을 추정합니다.
        </p>

        <Figure src="/help/measure-keys.png?v=1" caption="측정 탭 — 대표건반 10개 안내" />

        <Steps
          items={[
            "측정 탭에서 안내된 대표 건반을 하나씩 칩니다.",
            "해당 음이 안정적으로 잡히면 자동으로 캡처됩니다. (수동 캡처도 가능)",
            "10개를 모두 재면 자동으로 88건반 조율 커브가 만들어집니다.",
            "커브 탭에서 완성된 곡선을 확인합니다.",
          ]}
        />

        <Callout>
          <b>심화 · 무엇을 측정하나</b> — 각 대표건반에서 배음(부분음)을 8개까지 뽑아, 인하모니시티 계수
          <b style={{ color: colors.foreground }}> B </b>와 기본음 f0, 적합도 R²를 구합니다. 부분음이 3개 이상 잡혀야 유효한
          측정으로 저장됩니다.
        </Callout>

        <Callout>
          <b>심화 · 어떻게 88건반으로 확장되나</b> — 측정된 대표건반 B값을 로그 스케일에서 PCHIP(단조 큐빅)
          보간해 88건반 전체의 B 곡선을 만듭니다. 측정이 0개면 표준 곡선을, 1개면 그 점을 지나도록 표준 곡선을
          평행 이동해 사용합니다.
        </Callout>

        <Callout>
          <b>심화 · 목표 주파수 계산</b> — B 곡선을 바탕으로 맥놀이가 사라지는 옥타브 비율 방정식으로 목표
          주파수를 산출합니다. 중앙 옥타브(E4–D#5)를 평균율에 고정하고, 거기서 바깥쪽(저음·고음)으로
          스트레치를 점진적으로 확장합니다. 확장 폭은 설정의 스트레치 스타일(2:1 / 4:2 / 6:3 / 8:4, 기본 4:2)로
          바꿀 수 있습니다.
        </Callout>

        <Figure src="/help/curve-chart.png?v=1" caption="커브 탭 — 완성된 88건반 조율 커브" />
      </Section>

      <p
        style={{
          fontFamily: Fonts.sans,
          fontSize: 12,
          color: colors.mutedForeground,
          textAlign: "center",
          margin: "8px 0 4px",
        }}
      >
        더 궁금한 점은 설정 → 문의로 남겨주세요.
      </p>
    </div>
  );
}

/* ── 재사용 컴포넌트 ─────────────────────────────── */

function Section({
  id,
  title,
  kicker,
  children,
}: {
  id: string;
  title: string;
  kicker: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} style={{ scrollMarginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingTop: 4 }}>
        <span style={{ fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 2, color: colors.primary }}>{kicker}</span>
        <h2 style={{ fontFamily: Fonts.sansBold, fontWeight: 700, fontSize: 18, color: colors.foreground, margin: 0 }}>
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

const p: React.CSSProperties = {
  fontFamily: Fonts.sans,
  fontSize: 13.5,
  lineHeight: 1.7,
  color: colors.foreground,
  margin: 0,
};

function FeatureRow({
  Icon,
  name,
  desc,
}: {
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  name: string;
  desc: string;
}) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "6px 0" }}>
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          border: `1px solid ${colors.border}`,
          backgroundColor: colors.card,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={17} color={colors.primary} strokeWidth={2} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontFamily: Fonts.sansBold, fontWeight: 700, fontSize: 13.5, color: colors.foreground }}>{name}</span>
        <span style={{ fontFamily: Fonts.sans, fontSize: 12.5, lineHeight: 1.55, color: colors.mutedForeground }}>{desc}</span>
      </div>
    </div>
  );
}

function Steps({ items }: { items: string[] }) {
  return (
    <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((t, i) => (
        <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: 999,
              backgroundColor: colors.primary,
              color: colors.primaryForeground,
              fontFamily: Fonts.mono,
              fontSize: 12,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              marginTop: 1,
            }}
          >
            {i + 1}
          </span>
          <span style={{ fontFamily: Fonts.sans, fontSize: 13.5, lineHeight: 1.6, color: colors.foreground }}>{t}</span>
        </li>
      ))}
    </ol>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        padding: 14,
        borderRadius: 14,
        border: `1px solid ${colors.border}`,
        backgroundColor: colors.card,
        borderLeft: `3px solid ${colors.precision}`,
      }}
    >
      <Info size={16} color={colors.precision} strokeWidth={2} style={{ flexShrink: 0, marginTop: 2 }} />
      <p style={{ fontFamily: Fonts.sans, fontSize: 12.5, lineHeight: 1.65, color: colors.mutedForeground, margin: 0 }}>
        {children}
      </p>
    </div>
  );
}

/** 스크린샷 표시. 이미지가 없으면 점선 플레이스홀더를 보여준다. */
function Figure({ src, caption }: { src: string; caption: string }) {
  const [ok, setOk] = useState(true);

  return (
    <figure style={{ margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
      {ok ? (
        <img
          src={src}
          alt={caption}
          onError={() => setOk(false)}
          style={{
            width: "100%",
            borderRadius: 14,
            border: `1px solid ${colors.border}`,
            display: "block",
          }}
        />
      ) : (
        <div
          style={{
            width: "100%",
            aspectRatio: "9 / 16",
            maxHeight: 260,
            borderRadius: 14,
            border: `1.5px dashed ${colors.border}`,
            backgroundColor: colors.card,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            color: colors.mutedForeground,
          }}
        >
          <ImageIcon size={26} strokeWidth={1.6} />
          <span style={{ fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 1 }}>스크린샷 자리</span>
        </div>
      )}
      <figcaption
        style={{ fontFamily: Fonts.sans, fontSize: 11.5, color: colors.mutedForeground, textAlign: "center" }}
      >
        {caption}
      </figcaption>
    </figure>
  );
}
