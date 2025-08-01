package tech.callsafe.business.adapters

import androidx.fragment.app.Fragment
import androidx.fragment.app.FragmentManager
import androidx.lifecycle.Lifecycle
import androidx.viewpager2.adapter.FragmentStateAdapter
import tech.callsafe.business.fragments.CallHistoryFragment
import tech.callsafe.business.fragments.DashboardFragment
import tech.callsafe.business.fragments.SettingsFragment

class DashboardPagerAdapter(
    fragmentManager: FragmentManager,
    lifecycle: Lifecycle
) : FragmentStateAdapter(fragmentManager, lifecycle) {
    
    override fun getItemCount(): Int = 3
    
    override fun createFragment(position: Int): Fragment {
        return when (position) {
            0 -> DashboardFragment()
            1 -> CallHistoryFragment()
            2 -> SettingsFragment()
            else -> DashboardFragment()
        }
    }
}